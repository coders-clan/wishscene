import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'wishscene — Your imagination, in frame',
  description:
    'An interactive wishscene studio sandbox. Imagine an experience, shape a story, and make the scene.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
