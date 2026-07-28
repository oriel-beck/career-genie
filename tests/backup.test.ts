import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { BackupError, BackupLimits, validateBackup } from '../lib/backup';
import { GenerationOrigin } from '../lib/types';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

async function signed(overrides: Record<string, unknown> = {}) {
  const payload = {
    format: 'career-genie',
    version: 1,
    exportedAt: 1,
    profile: undefined,
    interview: undefined,
    jobs: [],
    generations: [],
    usage: [],
    preferences: { models: {} },
    ...overrides,
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const checksumSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { ...payload, checksumSha256 };
}

test('accepts a checksummed backup and rejects excluded key data', async () => {
  const backup = await signed();
  assert.equal((await validateBackup(backup)).checksumSha256, backup.checksumSha256);
  await assert.rejects(validateBackup(await signed({ apiKey: 'sk-secret' })), BackupError);
});

test('rejects damaged checksums, limits, and dangling generations', async () => {
  const damaged = await signed();
  damaged.checksumSha256 = '0'.repeat(64);
  await assert.rejects(validateBackup(damaged), BackupError);
  await assert.rejects(
    validateBackup(await signed({ jobs: Array(BackupLimits.MaxJobs + 1).fill(null) })),
    BackupError,
  );
  const generation = {
    id: 'generation-1',
    jobId: 'missing',
    version: 1,
    templateVersion: 1,
    origin: GenerationOrigin.Ai,
    resume: {},
    coverLetter: {},
    changeSummary: [],
    modelUsed: 'model',
    createdAt: 1,
  };
  await assert.rejects(validateBackup(await signed({ generations: [generation] })), BackupError);
});
