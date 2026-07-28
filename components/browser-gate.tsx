'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  BrowserCapability,
  checkBrowserSupport,
  type BrowserCapability as BrowserCapabilityValue,
} from '@/lib/browser-support';

const labels: Record<BrowserCapabilityValue, string> = {
  [BrowserCapability.SecureContext]: 'A secure HTTPS connection',
  [BrowserCapability.IndexedDB]: 'IndexedDB local storage',
  [BrowserCapability.CryptoSubtle]: 'Web Crypto encryption',
  [BrowserCapability.CryptoRandom]: 'Secure random values',
  [BrowserCapability.ShowDirectoryPicker]: 'Folder access',
  [BrowserCapability.FileSystemDirectoryHandle]: 'File system handles',
  [BrowserCapability.Blob]: 'Blob support',
  [BrowserCapability.FileReader]: 'FileReader support',
  [BrowserCapability.CreateObjectURL]: 'Object URL support',
};

export function BrowserGate({ children }: { children: ReactNode }) {
  const [missing, setMissing] = useState<BrowserCapabilityValue[] | null>(null);

  useEffect(() => {
    // Client-only capability probe; must run after mount (no window during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount check
    setMissing(
      (() => {
        try {
          return checkBrowserSupport().missing;
        } catch {
          return [BrowserCapability.IndexedDB];
        }
      })(),
    );
  }, []);

  if (missing === null) {
    return (
      <main className="gate" aria-live="polite">
        Checking browser support…
      </main>
    );
  }
  if (!missing.length) return <>{children}</>;
  return (
    <main className="gate" aria-labelledby="unsupported-title">
      <h1 id="unsupported-title">This browser is not supported</h1>
      <p>
        Career Genie requires a current desktop Chromium browser because your private data stays on
        this device.
      </p>
      <p>Use the latest desktop Chrome or Microsoft Edge, then try again.</p>
      <h2>Missing capabilities</h2>
      <ul>
        {missing.map((capability) => (
          <li key={capability}>{labels[capability]}</li>
        ))}
      </ul>
    </main>
  );
}
