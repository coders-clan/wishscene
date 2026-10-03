import { UnsavedChangesProvider } from '@/i18n/unsaved';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { localeDirection } from '../i18n/locales';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import './feedback.css';
import './mobile.css';
import { FeedbackLauncher } from '../components/feedback/launcher';
import { InstallApp } from '../components/install-app';
import { installCaptureScript } from '../components/install-capture';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: t('title'),
    description: t('description'),
    applicationName: 'wishscene',
    appleWebApp: { capable: true, title: 'wishscene', statusBarStyle: 'default' },
  };
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f5f0',
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <UnsavedChangesProvider>
            {children}
            <FeedbackLauncher />
            <InstallApp />
          </UnsavedChangesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
