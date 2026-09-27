import type { Metadata } from 'next';
import './globals.css';
import './feedback.css';
import { FeedbackLauncher } from '../components/feedback/launcher';
export const metadata: Metadata = {
  title: 'wishscene — Your imagination, in frame',
  description:
    'An interactive wishscene studio sandbox. Imagine an experience, shape a story, and make the scene.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <FeedbackLauncher />
      </body>
    </html>
  );
}
