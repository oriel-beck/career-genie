import Dexie, { type EntityTable } from 'dexie';
import type { Generation, InterviewState, Job, Profile, Settings, UsageRecord } from './types';

export class CareerGenieDb extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  interview!: EntityTable<InterviewState, 'id'>;
  jobs!: EntityTable<Job, 'id'>;
  generations!: EntityTable<Generation, 'id'>;
  usage!: EntityTable<UsageRecord, 'id'>;

  constructor(name = 'career-genie') {
    super(name);
    this.version(1).stores({
      settings: '&id',
      profiles: '&id, updatedAt',
      interview: '&id, updatedAt',
      jobs: '&id, status, company, title, createdAt, updatedAt',
      generations: '&id, jobId, [jobId+version], createdAt',
      usage: '&id, callKind, model, at',
    });
  }
}

export const db = new CareerGenieDb();
