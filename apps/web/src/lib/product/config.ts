import { BlockList, isIP } from 'node:net';
import { s3SettingsFromEnv, type S3Settings } from '@wishscene/storage';
import { configuredAppOrigin } from '../request-security';

export interface ProductConfig {
  databaseUrl: string;
  secret: string;
  baseURL: string;
  s3: S3Settings;
  mailer: 'dev-outbox';
  ipAddressHeaders: string[];
  trustedProxies: string[];
}

const IPV4_MAPPED = new BlockList();
IPV4_MAPPED.addSubnet('::ffff:0:0', 96, 'ipv6');

/**
 * Comma-separated IPs or CIDR ranges; null when any entry is malformed. Also refused, because
 * Better Auth would silently drop or reinterpret them: IPv6 zone ids, IPv4-mapped IPv6 (write
 * those as plain IPv4) and IPv6 with an embedded dotted quad (write it in hex).
 */
export function parseTrustedProxies(value: string | undefined): string[] | null {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const valid = entries.every((entry) => {
    const [ip, prefix, extra] = entry.split('/');
    const family = isIP(ip);
    if (!family || extra !== undefined || ip.includes('%')) return false;
    // Better Auth parses an embedded dotted quad (::1.2.3.4) as the wrong address.
    if (family === 6 && ip.includes('.')) return false;
    if (family === 6 && IPV4_MAPPED.check(ip, 'ipv6')) return false;
    return prefix === undefined || (/^\d+$/.test(prefix) && +prefix <= (family === 4 ? 32 : 128));
  });
  return valid ? entries : null;
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
  const trustedProxies = parseTrustedProxies(env.WISHSCENE_TRUSTED_PROXIES);
  if (!trustedProxies) missing.push('WISHSCENE_TRUSTED_PROXIES');
  // No mail provider is chosen yet (ADR 0002), so production product mode stays disabled.
  if (env.NODE_ENV === 'production') missing.push('MAIL_PROVIDER');
  if (missing.length || !databaseUrl || !s3.settings || !trustedProxies)
    return { config: null, missing };
  return {
    config: {
      databaseUrl,
      secret,
      // hunch-why: A fixed base URL; magic links must never be built from the request Host header.
      baseURL: origin || `http://localhost:${env.PORT || 3000}`,
      s3: s3.settings,
      mailer: 'dev-outbox',
      // Vercel sets x-real-ip to the connecting client. Elsewhere Better Auth reads
      // X-Forwarded-For: with trusted proxies it takes the rightmost untrusted hop; without, it
      // trusts only a single-value header. Anything else resolves no IP, and those clients share
      // one rate-limit bucket, so a proxy that appends needs WISHSCENE_TRUSTED_PROXIES.
      ipAddressHeaders: env.VERCEL ? ['x-real-ip'] : ['x-forwarded-for'],
      trustedProxies: env.VERCEL ? [] : trustedProxies,
    },
    missing,
  };
}
