import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FeedbackRecord } from '@wishscene/contracts';
import { DomainError } from '@wishscene/domain';
import { databaseUrl, postgresPool } from '../postgres';

type Row = { id: string; body: string; revision: number; image: string | null };
interface Sql {
  query(text: string, values?: (string | number | null)[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}
const schema = `CREATE TABLE IF NOT EXISTS wishscene_feedback (id TEXT PRIMARY KEY, body TEXT NOT NULL, image TEXT, revision INTEGER NOT NULL, created_at TEXT NOT NULL)`;
const limitsSchema = `CREATE TABLE IF NOT EXISTS wishscene_feedback_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL)`;
export class FeedbackStore {
  constructor(
    private sql: Sql,
    readonly mode: 'sqlite' | 'postgres',
  ) {}
  async init() {
    await this.sql.query(schema);
    await this.sql.query(limitsSchema);
    return this;
  }
  async close() {
    await this.sql.close();
  }
  async list() {
    const rows = await this.sql.query(
      'SELECT body, image IS NOT NULL AS has_image FROM wishscene_feedback ORDER BY created_at DESC, id DESC',
    );
    return rows.map((row) => ({
      item: JSON.parse(String(row.body)) as FeedbackRecord,
      hasImage: Boolean(row.has_image),
    }));
  }
  async get(id: string) {
    const row = (
      await this.sql.query(
        'SELECT id, body, revision, image FROM wishscene_feedback WHERE id = $1',
        [id],
      )
    )[0] as Row | undefined;
    if (!row) throw new DomainError(404, 'NOT_FOUND', 'Feedback item not found.');
    return { item: JSON.parse(row.body) as FeedbackRecord, image: row.image };
  }
  async create(item: FeedbackRecord, image: string | null) {
    // hunch-why: Feedback is shared across visitors and survives mock resets. SQLite provides zero-config local persistence; Postgres provides shared durable storage across deployed instances. Atomic revision checks protect concurrent edits.
    await this.sql.query(
      'INSERT INTO wishscene_feedback (id, body, image, revision, created_at) SELECT $1, $2, $3, $4, $5 WHERE (SELECT COUNT(*) FROM wishscene_feedback) < 1000 ON CONFLICT (id) DO NOTHING',
      [item.id, JSON.stringify(item), image, item.revision, item.createdAt],
    );
    const saved = await this.get(item.id).catch(() => {
      throw new DomainError(
        409,
        'BOARD_FULL',
        'The board has reached 1,000 items. Export and archive the database before continuing.',
      );
    });
    if (saved.item.creator !== item.creator)
      throw new DomainError(409, 'DUPLICATE_ID', 'Please start a new feedback report.');
    return saved;
  }
  async change(id: string, mutate: (item: FeedbackRecord) => FeedbackRecord) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await this.get(id);
      const after = mutate(before.item);
      if (after === before.item) return before;
      const rows = await this.sql.query(
        'UPDATE wishscene_feedback SET body = $1, revision = $2 WHERE id = $3 AND revision = $4 RETURNING id',
        [JSON.stringify(after), after.revision, id, before.item.revision],
      );
      if (rows.length) return { item: after, image: before.image };
    }
    throw new DomainError(409, 'BUSY', 'Another update is in progress. Try again.');
  }
  async rateLimit(actor: string, now = Date.now()) {
    await this.sql.query('DELETE FROM wishscene_feedback_limits WHERE expires < $1', [now]);
    const rows = await this.sql.query(
      'INSERT INTO wishscene_feedback_limits (id, count, expires) VALUES ($1, 1, $2) ON CONFLICT (id) DO UPDATE SET count = wishscene_feedback_limits.count + 1 RETURNING count',
      [actor, now + 60000],
    );
    if (Number(rows[0].count) > 30)
      throw new DomainError(429, 'RATE_LIMIT', 'Too many changes. Please wait one minute.');
  }
}
export async function sqliteFeedback(path: string) {
  const { DatabaseSync } = await import('node:sqlite');
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return new FeedbackStore(
    {
      async query(text, values = []) {
        return db.prepare(text.replace(/\$\d+/g, '?')).all(...values) as Record<string, unknown>[];
      },
      async close() {
        db.close();
      },
    },
    'sqlite',
  ).init();
}
export async function postgresFeedback(connectionString: string) {
  const pool = postgresPool(connectionString);
  return new FeedbackStore(
    {
      async query(text, values) {
        return (await pool.query(text, values)).rows;
      },
      async close() {
        await pool.end();
      },
    },
    'postgres',
  ).init();
}
const globalStore = globalThis as typeof globalThis & {
  wishsceneFeedback?: Promise<FeedbackStore>;
};
export async function feedbackStore() {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.WISHSCENE_FEEDBACK !== '1' &&
    process.env.WISHSCENE_MOCK !== '1'
  )
    throw new DomainError(
      503,
      'FEEDBACK_DISABLED',
      'The feedback board has not been enabled on this deployment.',
    );
  if (process.env.VERCEL && !(process.env.WISHSCENE_FEEDBACK_DATABASE_URL || databaseUrl()))
    throw new DomainError(
      503,
      'STORAGE_REQUIRED',
      'Configure WISHSCENE_FEEDBACK_DATABASE_URL to enable shared feedback on Vercel.',
    );
  globalStore.wishsceneFeedback ??= (
    process.env.WISHSCENE_FEEDBACK_DATABASE_URL || databaseUrl()
      ? postgresFeedback((process.env.WISHSCENE_FEEDBACK_DATABASE_URL || databaseUrl())!)
      : sqliteFeedback(
          process.env.WISHSCENE_FEEDBACK_DB || resolve('.data/wishscene.feedback.sqlite'),
        )
  ).catch((error) => {
    globalStore.wishsceneFeedback = undefined;
    throw error;
  });
  return globalStore.wishsceneFeedback;
}
