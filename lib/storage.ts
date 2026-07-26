import type { Table } from 'dexie';

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

function safeMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'QuotaExceededError') return 'Local storage is full. Free space and try again.';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Browser storage permission was denied. Check site permissions and try again.';
  }
  return 'Could not save local data. Please try again.';
}

export async function save<T, Key>(table: Table<T, Key>, value: T): Promise<void> {
  try {
    await table.put(value);
  } catch (error) {
    throw new StorageError(safeMessage(error));
  }
}

export async function remove<T, Key>(table: Table<T, Key>, key: Key): Promise<void> {
  try {
    await table.delete(key);
  } catch (error) {
    throw new StorageError(safeMessage(error));
  }
}

export async function persistStorage(): Promise<boolean | undefined> {
  if (typeof navigator === 'undefined') return undefined;
  try {
    return await navigator.storage?.persist();
  } catch {
    return undefined;
  }
}

export async function storageEstimate(): Promise<StorageEstimate | undefined> {
  if (typeof navigator === 'undefined') return undefined;
  try {
    return await navigator.storage?.estimate();
  } catch {
    return undefined;
  }
}
