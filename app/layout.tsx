import './globals.css';
import type { Metadata } from 'next';
import { AppHeader } from '@/components/app-header';

export const metadata: Metadata = {
  title: 'Lincoln Club Scheduler',
  description: 'Hosted school club scheduling system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppHeader />

        <main className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-7">
          {children}
        </main>
      </body>
    </html>
  );
}