import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DomainError, MockStudio } from '@wishscene/domain';
import type { Workspace } from '@wishscene/contracts';
import { databaseUrl, postgresPool } from './postgres';
const LOCAL_TTL = 60 * 60 * 1000;
const DATABASE_TTL = 30 * 24 * LOCAL_TTL;
const registry = globalThis as typeof globalThis & {
  wishsceneSessions?: Map<string, { studio: MockStudio; seen: number }>;
};
const sessions = (registry.wishsceneSessions ??= new Map());
const initialized = new WeakMap<Pool, Promise<void>>();
async function initialize(pool: Pool) {
  let ready = initialized.get(pool);
  if (!ready) {
    ready = pool
      .query(
        'CREATE TABLE IF NOT EXISTS wishscene_demo_workspaces (id TEXT PRIMARY KEY, body JSONB NOT NULL, schema_version INTEGER NOT NULL, expires BIGINT NOT NULL)',
      )
      .then(() => undefined)
      .catch((error) => {
        initialized.delete(pool);
        throw error;
      });
    initialized.set(pool, ready);
  }
  await ready;
}
// hunch-why: Deployed demo workspaces use a Postgres row lock per browser session. Hydrate, apply domain rules, and save in one transaction so Vercel instances cannot lose approvals, social drafts, or generation updates. Local development retains the keyless in-memory adapter.
export async function withPostgresWorkspace<T>(
  pool: Pool,
  suppliedId: string | undefined,
  action: (studio: MockStudio) => Promise<T>,
  now = Date.now(),
) {
  await initialize(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM wishscene_demo_workspaces WHERE expires < $1', [now]);
    const row = suppliedId
      ? (
          await client.query(
            'SELECT body, schema_version FROM wishscene_demo_workspaces WHERE id = $1 AND expires >= $2 FOR UPDATE',
            [suppliedId, now],
          )
        ).rows[0]
      : undefined;
    let sessionId = suppliedId;
    let studio: MockStudio;
    if (row) {
      if (row.schema_version !== 1)
        throw new DomainError(
          503,
          'WORKSPACE_VERSION',
          'This workspace needs a database migration.',
        );
      studio = MockStudio.restore(row.body as Workspace);
    } else {
      const count = Number(
        (await client.query('SELECT COUNT(*) AS count FROM wishscene_demo_workspaces')).rows[0]
          .count,
      );
      if (count >= 1000)
        throw new DomainError(503, 'CAPACITY', 'The demo is at capacity. Try again later.');
      sessionId = randomUUID();
      studio = new MockStudio();
      await client.query(
        'INSERT INTO wishscene_demo_workspaces (id, body, schema_version, expires) VALUES ($1, $2, 1, $3)',
        [sessionId, JSON.stringify(studio.snapshot()), now + DATABASE_TTL],
      );
    }
    const value = await action(studio);
    await client.query(
      'UPDATE wishscene_demo_workspaces SET body = $1, expires = $2 WHERE id = $3',
      [JSON.stringify(studio.snapshot()), now + DATABASE_TTL, sessionId],
    );
    await client.query('COMMIT');
    return { value, sessionId: sessionId!, maxAge: DATABASE_TTL / 1000 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function withWorkspace<T>(
  suppliedId: string | undefined,
  action: (studio: MockStudio) => Promise<T>,
) {
  const url = databaseUrl();
  if (url) return withPostgresWorkspace(postgresPool(url), suppliedId, action);
  if (process.env.VERCEL)
    throw new DomainError(
      503,
      'STORAGE_REQUIRED',
      'Connect Neon and set DATABASE_URL before using this demo on Vercel.',
    );
  const now = Date.now();
  for (const [id, session] of sessions) if (now - session.seen > LOCAL_TTL) sessions.delete(id);
  let sessionId = suppliedId;
  if (!sessionId || !sessions.has(sessionId)) {
    if (sessions.size >= 100)
      throw new DomainError(503, 'CAPACITY', 'The demo is at capacity. Try again later.');
    sessionId = randomUUID();
    sessions.set(sessionId, { studio: new MockStudio(), seen: now });
  }
  const session = sessions.get(sessionId)!;
  session.seen = now;
  return { value: await action(session.studio), sessionId, maxAge: LOCAL_TTL / 1000 };
}
