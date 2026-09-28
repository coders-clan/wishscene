import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'wishscene',
    short_name: 'wishscene',
    description:
      'Imagine an experience, shape a story, and make the scene. Your imagination, in frame.',
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
