import { defineConfig } from 'prisma/config';

// hunch-why: `prisma generate` must work without a database (CI typecheck, Vercel build),
// so the datasource is only declared when a URL is present. Migrate commands fail closed.
const url = process.env.WISHSCENE_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
