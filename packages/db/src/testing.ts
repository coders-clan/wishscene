import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { newPrismaClient } from './client';

// Integration-test helpers. Never imported by application code.

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = join(
  dirname(createRequire(import.meta.url).resolve('prisma/package.json')),
  'build',
  'index.js',
);

/** Runs the Prisma CLI in packages/db against `url`; returns its exit status and output. */
export function runPrisma(args: string[], url: string) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: packageRoot,
    env: { ...process.env, WISHSCENE_DATABASE_URL: url, DATABASE_URL: url },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * Creates a throwaway database from WISHSCENE_TEST_PG_URL, applies every migration and returns
 * a client for it. Call `drop()` in afterAll.
 */
export async function createTestDatabase(baseUrl = process.env.WISHSCENE_TEST_PG_URL) {
  if (!baseUrl) throw new Error('WISHSCENE_TEST_PG_URL is not set.');
  const name = `wishscene_it_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const target = new URL(baseUrl);
  target.pathname = `/${name}`;
  const url = target.toString();
  const migrated = runPrisma(['migrate', 'deploy'], url);
  if (migrated.status !== 0) throw new Error(`prisma migrate deploy failed:\n${migrated.output}`);
  const prisma = newPrismaClient(url);
  return {
    url,
    prisma,
    async drop() {
      await prisma.$disconnect();
      const client = new pg.Client({ connectionString: baseUrl });
      await client.connect();
      try {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await client.end();
      }
    },
  };
}
