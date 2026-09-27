import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@wishscene/contracts', '@wishscene/domain', '@wishscene/providers'],
  poweredByHeader: false,
  output: 'standalone',
};
export default config;
