import { getLocale, getTranslations } from 'next-intl/server';
import { localeDirection } from '@/i18n/locales';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('metadata');
  const locale = await getLocale();
  return {
    id: '/',
    name: t('manifestName'),
    short_name: t('manifestName'),
    description: t('manifestDescription'),
    lang: locale,
    dir: localeDirection(locale),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f5f0',
    theme_color: '#f7f5f0',
    categories: ['photo', 'entertainment', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
