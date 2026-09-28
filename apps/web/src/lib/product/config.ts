import { s3SettingsFromEnv, type S3Settings } from '@wishscene/storage';
import { configuredAppOrigin } from '../request-security';

export interface ProductConfig {
  databaseUrl: string;
  secret: string;
  baseURL: string;
  s3: S3Settings;
  mailer: 'dev-outbox';
  ipAddressHeaders: string[];
}

/**
 * Reads product-mode settings. `missing` lists variable NAMES only, never values. Product mode
 * fails closed until every entry is present.
 */
export function productConfig(env: NodeJS.ProcessEnv = process.env): {
  config: ProductConfig | null;
  missing: string[];
} {
  const missing: string[] = [];
  const databaseUrl = env.WISHSCENE_DATABASE_URL || env.DATABASE_URL;
  if (!databaseUrl) missing.push('DATABASE_URL');
  const secret = env.AUTH_SECRET ?? '';
  if (secret.length < 32) missing.push('AUTH_SECRET');
  const s3 = s3SettingsFromEnv(env);
  missing.push(...s3.missing);
  const deployed = !!(env.VERCEL || env.RENDER);
  const origin = configuredAppOrigin();
  if (origin === null || (deployed && !origin)) missing.push('WISHSCENE_PUBLIC_ORIGIN');
  // No mail provider is chosen yet (ADR 0002), so production product mode stays disabled.
  if (env.NODE_ENV === 'production') missing.push('MAIL_PROVIDER');
  if (missing.length || !databaseUrl || !s3.settings) return { config: null, missing };
  return {
    config: {
      databaseUrl,
      secret,
      // hunch-why: A fixed base URL; magic links must never be built from the request Host header.
      baseURL: origin || `http://localhost:${env.PORT || 3000}`,
      s3: s3.settings,
      mailer: 'dev-outbox',
      // Vercel sets x-real-ip to the connecting client. Elsewhere Better Auth trusts
      // X-Forwarded-For only while it holds one address, so a proxy must set or append it.
      ipAddressHeaders: env.VERCEL ? ['x-real-ip'] : ['x-forwarded-for'],
    },
    missing,
  };
}
