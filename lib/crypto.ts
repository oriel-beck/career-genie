import type { EncryptedKeyRecord } from './types';

export const KEY_ITERATIONS = 600_000;
export const KEY_AAD = 'career-genie:key:v1';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class CryptoError extends Error {
  constructor(message = 'wrong passphrase or damaged key data') {
    super(message);
    this.name = 'CryptoError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new CryptoError();
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function assertPassphrase(passphrase: string): void {
  if (passphrase.length < 12) throw new CryptoError('Passphrase must be at least 12 characters');
}

export async function deriveWrappingKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  assertPassphrase(passphrase);
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bufferSource(salt), iterations: KEY_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptKey(apiKey: string, passphrase: string): Promise<EncryptedKeyRecord> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const wrappingKey = await deriveWrappingKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: bufferSource(iv), additionalData: bufferSource(encoder.encode(KEY_AAD)) },
    wrappingKey,
    bufferSource(encoder.encode(apiKey)),
  );
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: KEY_ITERATIONS,
    aad: KEY_AAD,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptKey(record: EncryptedKeyRecord, wrappingKey: CryptoKey): Promise<string> {
  if (
    record.v !== 1 ||
    record.kdf !== 'PBKDF2-SHA256' ||
    record.iterations !== KEY_ITERATIONS ||
    record.aad !== KEY_AAD
  ) {
    throw new CryptoError();
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bufferSource(base64ToBytes(record.iv)),
        additionalData: bufferSource(encoder.encode(record.aad)),
      },
      wrappingKey,
      bufferSource(base64ToBytes(record.ciphertext)),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new CryptoError();
  }
}

export async function unlockEncryptedKey(record: EncryptedKeyRecord, passphrase: string): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(passphrase, base64ToBytes(record.salt));
  await decryptKey(record, wrappingKey);
  return wrappingKey;
}
