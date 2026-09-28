import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export { Prisma, PrismaClient };
export type Tx = Prisma.TransactionClient;

const clients = globalThis as typeof globalThis & { wishscenePrisma?: Map<string, PrismaClient> };

/** An uncached client. Callers pass a URL already hardened for their deployment (sslmode). */
export function newPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    }),
  });
}

/** One client per URL per process, reused across serverless invocations and hot reloads. */
export function createPrisma(connectionString: string) {
  const registry = (clients.wishscenePrisma ??= new Map());
  let client = registry.get(connectionString);
  if (!client) {
    client = newPrismaClient(connectionString);
    registry.set(connectionString, client);
  }
  return client;
}

/** Interactive transaction limits: the pool holds 4 connections, so queue briefly for one. */
export const TX = { maxWait: 5_000, timeout: 10_000 } as const;

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Contention a client can retry: no connection or transaction in time (P2028), conflicts (P2034). */
export function isTransientDbError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2028' || error.code === 'P2034')
  );
}

/**
 * Runs `fn` in a transaction that may delete append-only history (story_bibles,
 * approval_events, audit_events), e.g. account deletion. SET LOCAL ends with the transaction,
 * so the flag never outlives it on a pooled connection. Never set wishscene.purge any other way.
 */
export function withPurge<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL wishscene.purge = 'on'");
    return fn(tx);
  }, TX);
}

/**
 * Fixed-window counter shared by every instance. Counts this attempt and returns whether it is
 * within `max` for the current window. Keys must not contain personal data; hash them.
 */
export async function takeThrottle(
  prisma: PrismaClient,
  key: string,
  max: number,
  windowMs: number,
) {
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO throttles (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN throttles.window_start <= now() - make_interval(secs => ${windowMs / 1000}::float8)
        THEN now() ELSE throttles.window_start END,
      count = CASE WHEN throttles.window_start <= now() - make_interval(secs => ${windowMs / 1000}::float8)
        THEN 1 ELSE throttles.count + 1 END
    RETURNING count`;
  return row.count <= max;
}
