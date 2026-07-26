import { db } from './db';
import { decryptKey, encryptKey, unlockEncryptedKey } from './crypto';
import { KeyStorageMode, type KeyStorageMode as KeyStorageModeValue, type Settings } from './types';

const IDLE_MS = 15 * 60 * 1000;
let stagedKey: string | undefined;
let sessionKey: string | undefined;
let wrappingKey: CryptoKey | undefined;
let lastCompletedUse = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export class LockedKeyError extends Error {
  constructor() {
    super('API key is locked');
    this.name = 'LockedKeyError';
  }
}

function armIdleLock(): void {
  if (typeof window === 'undefined') return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(lock, IDLE_MS);
}

function assertNotIdle(): void {
  if (lastCompletedUse && Date.now() - lastCompletedUse >= IDLE_MS) lock();
}

function keyHint(key: string): string {
  return key.slice(-4);
}

async function currentSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? {
    id: 1,
    keyStorage: KeyStorageMode.Encrypted,
    models: {},
    updatedAt: Date.now(),
  };
}

export function stageKey(key: string): void {
  if (!key) throw new Error('API key is required');
  stagedKey = key;
}

export async function commitStagedKey(
  mode: KeyStorageModeValue,
  passphrase?: string,
  plaintextConfirmed = false,
): Promise<void> {
  if (!stagedKey) throw new LockedKeyError();
  if (mode === KeyStorageMode.Plaintext && !plaintextConfirmed) {
    throw new Error('Plaintext key storage requires confirmation');
  }

  const settings = await currentSettings();
  const key = stagedKey;
  const next: Settings = {
    id: 1,
    keyStorage: mode,
    keyHint: keyHint(key),
    models: settings.models,
    folderHandle: settings.folderHandle,
    updatedAt: Date.now(),
  };
  if (mode === KeyStorageMode.Encrypted) {
    if (!passphrase) throw new Error('Passphrase is required');
    next.encryptedKey = await encryptKey(key, passphrase);
    wrappingKey = await unlockEncryptedKey(next.encryptedKey, passphrase);
  } else if (mode === KeyStorageMode.Plaintext) {
    next.plaintextKey = key;
    wrappingKey = undefined;
  } else {
    wrappingKey = undefined;
  }
  await db.settings.put(next);
  if (mode === KeyStorageMode.Session) sessionKey = key;
  else sessionKey = undefined;
  stagedKey = undefined;
  lastCompletedUse = Date.now();
  armIdleLock();
}

export async function unlock(passphrase: string): Promise<void> {
  const settings = await db.settings.get(1);
  if (!settings?.encryptedKey || settings.keyStorage !== KeyStorageMode.Encrypted) {
    throw new LockedKeyError();
  }
  wrappingKey = await unlockEncryptedKey(settings.encryptedKey, passphrase);
  lastCompletedUse = Date.now();
  armIdleLock();
}

export async function withApiKey<T>(fn: (apiKey: string) => Promise<T> | T): Promise<T> {
  assertNotIdle();
  const settings = await db.settings.get(1);
  let apiKey: string | undefined = stagedKey;
  if (!apiKey && settings?.keyStorage === KeyStorageMode.Encrypted) {
    if (!wrappingKey || !settings.encryptedKey) throw new LockedKeyError();
    apiKey = await decryptKey(settings.encryptedKey, wrappingKey);
  } else if (!apiKey && settings?.keyStorage === KeyStorageMode.Session) {
    apiKey = sessionKey;
  } else if (!apiKey && settings?.keyStorage === KeyStorageMode.Plaintext) {
    apiKey = settings.plaintextKey;
  }
  if (!apiKey) throw new LockedKeyError();
  try {
    const result = await fn(apiKey);
    if (settings?.keyStorage !== KeyStorageMode.Plaintext) {
      lastCompletedUse = Date.now();
      armIdleLock();
    }
    return result;
  } finally {
    apiKey = undefined;
  }
}

export function lock(): void {
  stagedKey = undefined;
  sessionKey = undefined;
  wrappingKey = undefined;
  lastCompletedUse = 0;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
}

export function checkIdleLock(): void {
  assertNotIdle();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', lock);
