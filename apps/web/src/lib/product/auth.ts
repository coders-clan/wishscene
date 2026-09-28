import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins/magic-link';
import { takeThrottle, type PrismaClient } from '@wishscene/db';
import { log } from './log';
import type { Mailer } from './mailer';

export const AUTH_BASE_PATH = '/api/v1/auth';
export const MAGIC_LINKS_PER_ADDRESS = 3;
const MAGIC_LINK_ADDRESS_WINDOW_MS = 10 * 60_000;

/**
 * Better Auth for product mode: passwordless magic links (hashed, single use, 10 minutes),
 * rate limits stored in Postgres so they hold across serverless instances. Mounted at
 * /api/v1/auth, apart from the feedback board's GitHub sign-in at /api/auth.
 */
export function createProductAuth(options: {
  prisma: PrismaClient;
  secret: string;
  baseURL: string;
  mailer: Mailer;
  /** Headers naming the client IP for rate limits; see productConfig(). */
  ipAddressHeaders?: string[];
}) {
  const { prisma, mailer, baseURL } = options;
  // Keyed hash: the throttle table never holds an address, nor a hash that is cheap to reverse.
  const addressKey = (email: string) =>
    'magic-link:' +
    createHmac('sha256', options.secret).update(email.trim().toLowerCase()).digest('base64url');
  return betterAuth({
    appName: 'wishscene',
    baseURL,
    basePath: AUTH_BASE_PATH,
    secret: options.secret,
    trustedOrigins: [baseURL],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    user: {
      additionalFields: { deletedAt: { type: 'date', required: false, input: false } },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/magic-link': { window: 60, max: 5 },
        '/magic-link/verify': { window: 60, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: 'wishscene-product',
      useSecureCookies: baseURL.startsWith('https:'),
      ipAddress: { ipAddressHeaders: options.ipAddressHeaders ?? ['x-forwarded-for'] },
    },
    databaseHooks: {
      session: {
        create: {
          // Deleted (tombstoned) accounts cannot start new sessions.
          async before(session) {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { deletedAt: true },
            });
            if (!user || user.deletedAt) return false;
          },
        },
      },
    },
    logger: {
      level: 'error',
      log: (level, message, ...args) => log(level, `auth: ${message}`, { args }),
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          // Per address across all clients, so rotating IPs cannot flood one inbox.
          const allowed = await takeThrottle(
            prisma,
            addressKey(email),
            MAGIC_LINKS_PER_ADDRESS,
            MAGIC_LINK_ADDRESS_WINDOW_MS,
          );
          if (!allowed)
            throw new APIError('TOO_MANY_REQUESTS', {
              message: 'Too many sign-in links for this address. Try again in a few minutes.',
            });
          await mailer.send({
            to: email,
            subject: 'Your wishscene sign-in link',
            text: `Sign in to wishscene:\n\n${url}\n\nThe link works once and expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
          });
        },
      }),
    ],
  });
}
export type ProductAuth = ReturnType<typeof createProductAuth>;
