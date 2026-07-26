import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Career Genie',
  description: 'Private, browser-based resume tailoring.',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading x-nonce registers it with Next so framework scripts/styles get the
  // CSP nonce. Do not put nonce on <body> — browsers hide it and break hydration.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en">
      <body data-csp-nonce={nonce}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
