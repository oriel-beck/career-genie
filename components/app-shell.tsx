'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrowserGate } from './browser-gate';
import { KeyStatusIndicator } from './key-status-indicator';

const links = [
  { href: '/onboarding', label: 'Profile' },
  { href: '/dashboard', label: 'Jobs' },
  { href: '/settings', label: 'Settings' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <BrowserGate>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" href="/">
            Career Genie
          </Link>
          <div className="site-header-actions">
            <KeyStatusIndicator />
            <nav aria-label="Primary navigation">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={pathname === link.href ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </BrowserGate>
  );
}
