import { Pool } from 'pg';
const pools = globalThis as typeof globalThis & { wishscenePgPools?: Map<string, Pool> };
export function postgresPool(connectionString: string) {
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
