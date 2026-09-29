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
 * The mailbox an address most likely delivers to, so variants share one throttle budget:
 * lowercase, no +tag, and for Gmail no dots. Best effort: providers with other alias schemes
 * (e.g. Yahoo's -tag) or catch-all domains still get one budget per spelling.
 */
export function canonicalEmail(email: string) {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 0) return address;
  let local = address.slice(0, at).split('+')[0];
  let domain = address.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '');
  return `${local}@${domain}`;
}

/**
 * Throttle key for an address: HMAC of its canonical form under a key derived for this purpose
 * only, so the table never holds an address, nor a hash that is cheap to reverse, and the auth
 * secret itself never keys anything but Better Auth.
 */
export function magicLinkThrottleKey(secret: string, email: string) {
  const key = createHmac('sha256', secret).update('wishscene/magic-link-throttle/v1').digest();
  return (
    'magic-link:' + createHmac('sha256', key).update(canonicalEmail(email)).digest('base64url')
  );
}

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
  /** Proxy addresses (IP or CIDR) stripped from the right of X-Forwarded-For. */
  trustedProxies?: string[];
}) {
  const { prisma, mailer, baseURL } = options;
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
      ipAddress: {
        ipAddressHeaders: options.ipAddressHeaders ?? ['x-forwarded-for'],
        trustedProxies: options.trustedProxies ?? [],
      },
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
      // Warnings include an unresolvable client IP (shared rate-limit bucket) and ignored
      // trusted proxies, which operators must see.
      level: 'warn',
      log: (level, message, ...args) => log(level, `auth: ${message}`, { args }),
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          // Per address across all clients, so rotating IPs cannot flood one inbox.
          const { allowed, retryAfterSeconds } = await takeThrottle(
            prisma,
            magicLinkThrottleKey(options.secret, email),
            MAGIC_LINKS_PER_ADDRESS,
            MAGIC_LINK_ADDRESS_WINDOW_MS,
          );
          // The link's verification row was already written; it expires unused.
          if (!allowed)
            throw new APIError(
              'TOO_MANY_REQUESTS',
              { message: 'Too many sign-in links for this address. Try again in a few minutes.' },
              { 'Retry-After': String(retryAfterSeconds) },
            );
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
