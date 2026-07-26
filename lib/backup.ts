import { db, type CareerGenieDb } from './db';
import { KeyStorageMode, type BackupV1, type Generation, type Settings } from './types';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_JOBS = 10_000;
const MAX_GENERATIONS = 50_000;
const MAX_USAGE = 100_000;
const MAX_TURNS = 10_000;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function json(value: unknown): void {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) return value.forEach(json);
  if (isObject(value)) return Object.values(value).forEach(json);
  throw new BackupError('Backup contains invalid data');
}

function fields(value: unknown, names: readonly string[], label: string): Record<string, unknown> {
  if (!isObject(value) || Object.keys(value).some((name) => !names.includes(name))) {
    throw new BackupError(`Invalid ${label}`);
  }
  return value;
}

function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new BackupError(`Invalid ${label}`);
}

function number(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BackupError(`Invalid ${label}`);
}

function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new BackupError(`Invalid ${label}`);
}

function noSecretFields(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(noSecretFields);
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (['apiKey', 'encryptedKey', 'plaintextKey', 'keyHint', 'folderHandle', 'resumeBlob', 'coverBlob'].includes(key)) {
      throw new BackupError('Backup contains excluded data');
    }
    noSecretFields(child);
  }
}

function validateJob(value: unknown): void {
  const job = fields(value, ['id', 'title', 'company', 'url', 'description', 'requirements', 'keywords', 'status', 'matchScore', 'gaps', 'notes', 'createdAt', 'updatedAt'], 'job');
  for (const name of ['id', 'title', 'company', 'description', 'status']) string(job[name], `job.${name}`);
  number(job.matchScore, 'job.matchScore');
  if (!Number.isInteger(job.matchScore) || job.matchScore < 0 || job.matchScore > 100) throw new BackupError('Invalid job.matchScore');
  for (const name of ['requirements', 'keywords', 'gaps']) {
    array(job[name], `job.${name}`);
    job[name].forEach((item) => string(item, `job.${name}`));
  }
  for (const name of ['createdAt', 'updatedAt']) number(job[name], `job.${name}`);
  if (job.url !== undefined) string(job.url, 'job.url');
  if (job.notes !== undefined) string(job.notes, 'job.notes');
}

function validateGeneration(value: unknown, jobIds: Set<string>, generationIds: Set<string>): void {
  const generation = fields(value, ['id', 'jobId', 'version', 'templateVersion', 'origin', 'parentId', 'resume', 'coverLetter', 'changeSummary', 'extraContext', 'modelUsed', 'createdAt'], 'generation');
  for (const name of ['id', 'jobId', 'modelUsed']) string(generation[name], `generation.${name}`);
  for (const name of ['version', 'templateVersion', 'createdAt']) number(generation[name], `generation.${name}`);
  if (!jobIds.has(generation.jobId as string) || generationIds.has(generation.id as string)) {
    throw new BackupError('Generation has an invalid reference');
  }
  if (generation.parentId !== undefined && (!generationIds.has(generation.parentId as string) || generation.parentId === generation.id)) {
    throw new BackupError('Generation has an invalid parent reference');
  }
  array(generation.changeSummary, 'generation.changeSummary');
  generation.changeSummary.forEach((item) => string(item, 'generation.changeSummary'));
  if (generation.extraContext !== undefined) string(generation.extraContext, 'generation.extraContext');
  if (!isObject(generation.resume) || !isObject(generation.coverLetter)) throw new BackupError('Invalid generation document');
  generationIds.add(generation.id as string);
}

function validateUsage(value: unknown): void {
  const usage = fields(value, ['id', 'callKind', 'model', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'at'], 'usage record');
  for (const name of ['id', 'callKind', 'model']) string(usage[name], `usage.${name}`);
  for (const name of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'cacheWrite5mTokens', 'cacheWrite1hTokens', 'at']) {
    number(usage[name], `usage.${name}`);
  }
}

function canonical(payload: Omit<BackupV1, 'checksumSha256'>): Omit<BackupV1, 'checksumSha256'> {
  return {
    format: payload.format,
    version: payload.version,
    exportedAt: payload.exportedAt,
    profile: payload.profile,
    interview: payload.interview,
    jobs: payload.jobs,
    generations: payload.generations,
    usage: payload.usage,
    preferences: { models: payload.preferences.models },
  };
}

async function checksum(payload: Omit<BackupV1, 'checksumSha256'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(payload))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(database: CareerGenieDb = db): Promise<BackupV1> {
  const [profile, interview, jobs, generations, usage, settings] = await Promise.all([
    database.profiles.get(1),
    database.interview.get(1),
    database.jobs.toArray(),
    database.generations.toArray(),
    database.usage.toArray(),
    database.settings.get(1),
  ]);
  const cleanGenerations = generations.map((generation) => {
    const { resumeBlob: _rb, coverBlob: _cb, ...rest } = generation;
    void _rb;
    void _cb;
    return rest;
  });
  const payload = canonical({
    format: 'career-genie',
    version: 1,
    exportedAt: Date.now(),
    profile,
    interview,
    jobs,
    generations: cleanGenerations,
    usage,
    preferences: { models: settings?.models ?? {} },
  });
  return { ...payload, checksumSha256: await checksum(payload) };
}

export async function backupJson(database: CareerGenieDb = db): Promise<string> {
  return JSON.stringify(await createBackup(database));
}

export async function validateBackup(input: string | unknown): Promise<BackupV1> {
  if (typeof input === 'string' && new TextEncoder().encode(input).byteLength > MAX_BYTES) {
    throw new BackupError('Backup is larger than 20 MiB');
  }
  let value: unknown = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { throw new BackupError('Backup is not valid JSON'); }
  }
  const backup = fields(value, ['format', 'version', 'exportedAt', 'checksumSha256', 'profile', 'interview', 'jobs', 'generations', 'usage', 'preferences'], 'backup') as unknown as BackupV1;
  if (backup.format !== 'career-genie' || backup.version !== 1) throw new BackupError('Unsupported backup format');
  string(backup.checksumSha256, 'backup checksum');
  number(backup.exportedAt, 'backup.exportedAt');
  array(backup.jobs, 'backup.jobs');
  array(backup.generations, 'backup.generations');
  array(backup.usage, 'backup.usage');
  if (backup.jobs.length > MAX_JOBS || backup.generations.length > MAX_GENERATIONS || backup.usage.length > MAX_USAGE) {
    throw new BackupError('Backup exceeds record limits');
  }
  fields(backup.preferences, ['models'], 'preferences');
  if (!isObject(backup.preferences.models)) throw new BackupError('Invalid preferences.models');
  if (backup.interview !== undefined) {
    const interview = fields(backup.interview, ['id', 'turns', 'pendingProfile', 'pendingSummary', 'complete', 'updatedAt'], 'interview');
    if (interview.id !== 1 || typeof interview.complete !== 'boolean') throw new BackupError('Invalid interview');
    array(interview.turns, 'interview.turns');
    if (interview.turns.length > MAX_TURNS) throw new BackupError('Backup exceeds interview limit');
  }
  json(backup);
  noSecretFields({ ...backup, checksumSha256: undefined });
  const { checksumSha256: expected, ...payload } = backup;
  if (expected !== await checksum(canonical(payload))) throw new BackupError('Backup checksum does not match');

  const jobIds = new Set<string>();
  for (const job of backup.jobs) {
    validateJob(job);
    if (jobIds.has(job.id)) throw new BackupError('Duplicate job ID');
    jobIds.add(job.id);
  }
  const generationIds = new Set<string>();
  for (const generation of backup.generations) validateGeneration(generation, jobIds, generationIds);
  backup.usage.forEach(validateUsage);
  return { ...canonical(payload), checksumSha256: expected };
}

export async function importBackup(input: string | unknown, database: CareerGenieDb = db): Promise<BackupV1> {
  const backup = await validateBackup(input);
  const current = await database.settings.get(1);
  const settings: Settings = {
    id: 1,
    keyStorage: current?.keyStorage ?? KeyStorageMode.Encrypted,
    models: backup.preferences.models,
    folderHandle: current?.folderHandle,
    updatedAt: Date.now(),
  };
  if (current?.keyHint) settings.keyHint = current.keyHint;
  if (current?.encryptedKey) settings.encryptedKey = current.encryptedKey;
  if (current?.plaintextKey) settings.plaintextKey = current.plaintextKey;

  await database.transaction(
    'rw',
    [database.settings, database.profiles, database.interview, database.jobs, database.generations, database.usage],
    async () => {
      await Promise.all([
        database.profiles.clear(),
        database.interview.clear(),
        database.jobs.clear(),
        database.generations.clear(),
        database.usage.clear(),
      ]);
      if (backup.profile) await database.profiles.put(backup.profile);
      if (backup.interview) await database.interview.put(backup.interview);
      await Promise.all([
        database.jobs.bulkPut(backup.jobs),
        database.generations.bulkPut(backup.generations as Generation[]),
        database.usage.bulkPut(backup.usage),
        database.settings.put(settings),
      ]);
    },
  );
  return backup;
}

export const BackupLimits = { MaxBytes: MAX_BYTES, MaxJobs: MAX_JOBS, MaxGenerations: MAX_GENERATIONS, MaxUsage: MAX_USAGE, MaxTurns: MAX_TURNS } as const;
