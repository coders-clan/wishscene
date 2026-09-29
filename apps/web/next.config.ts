import type { NextConfig } from 'next';

const development = process.env.NODE_ENV === 'development';
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  "media-src 'self' data: blob:",
  `connect-src 'self'${development ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
];

const config: NextConfig = {
  transpilePackages: [
    '@wishscene/contracts',
    '@wishscene/db',
    '@wishscene/domain',
    '@wishscene/providers',
    '@wishscene/storage',
  ],
  poweredByHeader: false,
  // Dev request logs print full URLs; magic-link verification URLs carry the sign-in token.
  logging: { incomingRequests: { ignore: [/^\/api\/v1\/auth\//] } },
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default config;
