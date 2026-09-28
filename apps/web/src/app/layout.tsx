import type { Metadata, Viewport } from 'next';
import './globals.css';
import './feedback.css';
import './mobile.css';
import { FeedbackLauncher } from '../components/feedback/launcher';
import { InstallApp } from '../components/install-app';
import { installCaptureScript } from '../components/install-capture';
export const metadata: Metadata = {
  title: 'wishscene — Your imagination, in frame',
  description:
    'An interactive wishscene studio sandbox. Imagine an experience, shape a story, and make the scene.',
  applicationName: 'wishscene',
  appleWebApp: { capable: true, title: 'wishscene', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f5f0',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body>
        {children}
        <FeedbackLauncher />
        <InstallApp />
      </body>
    </html>
  );
}
