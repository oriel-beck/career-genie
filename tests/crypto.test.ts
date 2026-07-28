import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  CryptoError,
  decryptKey,
  deriveWrappingKey,
  encryptKey,
  unlockEncryptedKey,
} from '../lib/crypto';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

test('encrypts and decrypts an API key with a non-extractable key', async () => {
  const record = await encryptKey('sk-secret', 'a sufficiently long passphrase');
  const key = await deriveWrappingKey(
    'a sufficiently long passphrase',
    Uint8Array.from(atob(record.salt), (c) => c.charCodeAt(0)),
  );
  assert.equal(key.extractable, false);
  assert.equal(await decryptKey(record, key), 'sk-secret');
});

test('uses unique salt and IV and rejects bad authentication', async () => {
  const passphrase = 'a sufficiently long passphrase';
  const first = await encryptKey('sk-secret', passphrase);
  const second = await encryptKey('sk-secret', passphrase);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  await assert.rejects(
    unlockEncryptedKey({ ...first, aad: 'wrong' as never }, passphrase),
    CryptoError,
  );
  await assert.rejects(unlockEncryptedKey(first, 'not the right passphrase'), CryptoError);
});
