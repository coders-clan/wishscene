import { Pool } from 'pg';
const pools = globalThis as typeof globalThis & { wishscenePgPools?: Map<string, Pool> };

export function securePostgresConnectionString(
  connectionString: string,
  deployed = !!process.env.VERCEL || !!process.env.RENDER,
) {
  if (!deployed) return connectionString;
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Production database URLs must use PostgreSQL.');
  // pg 8 treats sslmode=require as verify-full, but pg 9 will adopt the weaker
  // libpq meaning. Make certificate and hostname verification explicit now.
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function postgresPool(connectionString: string) {
  connectionString = securePostgresConnectionString(connectionString);
  const registry = (pools.wishscenePgPools ??= new Map());
  let pool = registry.get(connectionString);
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    pool.on('error', () =>
      console.error('Idle database connection failed; the next request will reconnect.'),
    );
    registry.set(connectionString, pool);
  }
  return pool;
}
export function databaseUrl() {
  return process.env.WISHSCENE_DATABASE_URL || process.env.DATABASE_URL;
}
