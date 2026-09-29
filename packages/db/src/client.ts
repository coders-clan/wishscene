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

// Failures after which the statement surely did not take effect, so the call can be repeated as
// is: transaction not started or rolled back (P2028), write conflict (P2034), too many
// connections (P2037), database unreachable (P1001). A dropped or timed-out connection mid-query
// (P1008, P1017) is excluded: the write may have committed.
const TRANSIENT_CODES = new Set(['P1001', 'P2028', 'P2034', 'P2037']);
// pg-pool rejects with this plain Error when no pooled connection frees up in time; the Prisma
// adapter rethrows it unmapped, inside and outside interactive transactions.
const POOL_TIMEOUT = 'timeout exceeded when trying to connect';

/** Why a failed call can be retried (a Prisma code or POOL_TIMEOUT), or null. Safe to log. */
export function transientDbErrorCode(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return TRANSIENT_CODES.has(error.code) ? error.code : null;
  return error instanceof Error && error.message === POOL_TIMEOUT ? 'POOL_TIMEOUT' : null;
}

export function isTransientDbError(error: unknown) {
  return transientDbErrorCode(error) !== null;
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

/** Longest throttle window. Older rows count as expired for every key and may be pruned. */
export const THROTTLE_MAX_WINDOW_MS = 24 * 60 * 60_000;
const THROTTLE_PRUNE_RATE = 0.01;

/**
 * Fixed-window counter shared by every instance. Counts this attempt and returns whether it is
 * within `max` for the current window, and the seconds until that window ends. Keys must not
 * contain personal data; hash them.
 */
export async function takeThrottle(
  prisma: PrismaClient,
  key: string,
  max: number,
  windowMs: number,
) {
  if (windowMs > THROTTLE_MAX_WINDOW_MS) throw new Error('Throttle window too long.');
  const [row] = await prisma.$queryRaw<Array<{ count: number; retry_after: number }>>`
    INSERT INTO throttles (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN throttles.window_start <= now() - make_interval(secs => ${windowMs / 1000}::float8)
        THEN now() ELSE throttles.window_start END,
      count = CASE WHEN throttles.window_start <= now() - make_interval(secs => ${windowMs / 1000}::float8)
        THEN 1 ELSE throttles.count + 1 END
    RETURNING count, greatest(1, ceil(extract(epoch FROM
      window_start + make_interval(secs => ${windowMs / 1000}::float8) - now())))::int AS retry_after`;
  // Every key writes a row; an occasional sweep keeps the table from growing without bound. The
  // sweep is best effort: its failure must not fail the attempt that was already counted.
  if (Math.random() < THROTTLE_PRUNE_RATE)
    await Promise.resolve()
      .then(() => pruneThrottles(prisma))
      .catch(() => undefined);
  return { allowed: row.count <= max, retryAfterSeconds: row.retry_after };
}

/** Deletes throttle rows older than the longest window; they no longer limit anything. */
export function pruneThrottles(prisma: PrismaClient) {
  return prisma.$executeRaw`DELETE FROM throttles
    WHERE window_start < now() - make_interval(secs => ${THROTTLE_MAX_WINDOW_MS / 1000}::float8)`;
}
