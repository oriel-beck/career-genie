'use client';

import { liveQuery } from 'dexie';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import {
  checkIdleLock,
  currentKeyStatus,
  defaultSettings,
  KeyStatus,
  onKeyStatusChange,
} from '@/lib/keys';
import type { Settings } from '@/lib/types';

function useKeyStatus() {
  const [settings, setSettings] = useState<Settings>(() => defaultSettings());
  const [status, setStatus] = useState<KeyStatus>(() => currentKeyStatus(defaultSettings()));

  useEffect(() => {
    const subscription = liveQuery(() => db.settings.get(1)).subscribe({
      next: (saved) => setSettings(saved ?? defaultSettings()),
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function refresh() {
      checkIdleLock();
      setStatus(currentKeyStatus(settings));
    }
    refresh();
    const unsubscribe = onKeyStatusChange(refresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [settings]);

  return { status, settings };
}

const labels: Record<KeyStatus, string> = {
  [KeyStatus.None]: 'No API key',
  [KeyStatus.Locked]: 'Key locked',
  [KeyStatus.Unlocked]: 'Key unlocked',
};

export function KeyStatusIndicator() {
  const { status, settings } = useKeyStatus();
  const hint = settings.keyHint ? ` ·•••${settings.keyHint}` : '';
  const label = labels[status] + (status === KeyStatus.Unlocked ? hint : '');

  return (
    <Link
      className={`key-status key-status-${status}`}
      href="/settings"
      aria-label={`${labels[status]}. Open settings to manage your API key.`}
    >
      <span className="key-status-dot" aria-hidden />
      <span className="key-status-label">{label}</span>
    </Link>
  );
}
