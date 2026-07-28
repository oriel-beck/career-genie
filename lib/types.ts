export const JobStatus = {
  Saved: 'saved',
  Applied: 'applied',
  Interviewing: 'interviewing',
  Offer: 'offer',
  Rejected: 'rejected',
  Withdrawn: 'withdrawn',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const CallKind = {
  Parse: 'parse',
  Interview: 'interview',
  Analyze: 'analyze',
  Tailor: 'tailor',
} as const;
export type CallKind = (typeof CallKind)[keyof typeof CallKind];

export const Effort = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Xhigh: 'xhigh',
  Max: 'max',
} as const;
export type Effort = (typeof Effort)[keyof typeof Effort];

export interface ModelChoice {
  parse: string;
  interview: string;
  analyze: string;
  tailor: string;
}

export interface Supported { supported: boolean }
export interface ModelInfo {
  id: string;
  display_name: string;
  max_input_tokens: number;
  max_tokens: number;
  capabilities: {
    pdf_input?: Supported;
    structured_outputs?: Supported;
    effort?: Supported & Partial<Record<Effort, Supported>>;
    thinking?: Supported & {
      types?: { adaptive?: Supported; enabled?: Supported };
    };
    [name: string]: unknown;
  };
}

export const KeyStorageMode = {
  Encrypted: 'encrypted',
  Session: 'session',
  Plaintext: 'plaintext',
} as const;
export type KeyStorageMode = (typeof KeyStorageMode)[keyof typeof KeyStorageMode];

export interface EncryptedKeyRecord {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  aad: 'career-genie:key:v1';
  salt: string;
  iv: string;
  ciphertext: string;
}
export interface Settings {
  id: 1;
  keyStorage: KeyStorageMode;
  keyHint?: string;
  encryptedKey?: EncryptedKeyRecord;
  plaintextKey?: string;
  models: Partial<ModelChoice>;
  folderHandle?: FileSystemDirectoryHandle;
  updatedAt: number;
}
// No persisted field named `apiKey`. Only lib/keys.ts may read encryptedKey or
// plaintextKey. keyHint contains exactly the last four characters.

export interface Link { id: string; label: string; url: string }
export interface ProfileClaim { id: string; text: string }
export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  bullets: ProfileClaim[];
}
export interface Education {
  id: string;
  institution: string;
  qualification: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  details: ProfileClaim[];
}
export interface Project {
  id: string;
  name: string;
  url?: string;
  description: ProfileClaim;
  bullets: ProfileClaim[];
}
export interface Profile {
  id: 1;
  basics: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    links: Link[];
  };
  headline?: ProfileClaim;
  summary?: ProfileClaim;
  roles: WorkExperience[];
  education: Education[];
  projects: Project[];
  skills: ProfileClaim[];
  certifications: ProfileClaim[];
  languages: ProfileClaim[];
  updatedAt: number;
}

export const ChatRole = {
  User: 'user',
  Assistant: 'assistant',
} as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export interface ChatTurn {
  id: string;
  role: ChatRole;
  content: string;
  /** Clarifying questions from the assistant, shown as a numbered list. */
  questions?: string[];
  createdAt: number;
}
export interface InterviewState {
  id: 1;
  turns: ChatTurn[];
  pendingProfile?: Profile;
  pendingSummary?: string[];
  complete: boolean;
  updatedAt: number;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  url?: string;
  description: string;
  requirements: string[];
  keywords: string[];
  status: JobStatus;
  matchScore: number;
  gaps: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GroundedText {
  text: string;
  sourceIds: string[];
  userEdited?: boolean;
}
export interface ResumeRole {
  sourceRoleId: string;
  company: string;
  title: string;
  location?: string;
  dateRange: string;
  bullets: GroundedText[];
}
export interface ResumeDocument {
  basics: Profile['basics'];
  headline?: GroundedText;
  summary?: GroundedText;
  roles: ResumeRole[];
  education: Array<{
    sourceEducationId: string;
    institution: string;
    qualification: string;
    field?: string;
    dateRange: string;
    details: GroundedText[];
  }>;
  projects: Array<{
    sourceProjectId: string;
    name: string;
    url?: string;
    description: GroundedText;
    bullets: GroundedText[];
  }>;
  skills: GroundedText[];
  certifications: GroundedText[];
  languages: GroundedText[];
}
export interface CoverLetterDocument {
  greeting: string;
  paragraphs: GroundedText[];
  signoff: string;
}

export const GenerationOrigin = {
  Ai: 'ai',
  Manual: 'manual',
} as const;
export type GenerationOrigin = (typeof GenerationOrigin)[keyof typeof GenerationOrigin];

export interface Generation {
  id: string;
  jobId: string;
  version: number;
  templateVersion: 1;
  origin: GenerationOrigin;
  parentId?: string;
  resume: ResumeDocument;
  coverLetter: CoverLetterDocument;
  changeSummary: string[];
  extraContext?: string;
  resumeBlob?: Blob;
  coverBlob?: Blob;
  modelUsed: string;
  createdAt: number;
}

export interface UsageRecord {
  id: string;
  callKind: CallKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  at: number;
}

export interface BackupV1 {
  format: 'career-genie';
  version: 1;
  exportedAt: number;
  checksumSha256: string;
  profile?: Profile;
  interview?: InterviewState;
  jobs: Job[];
  generations: Array<Omit<Generation, 'resumeBlob' | 'coverBlob'>>;
  usage: UsageRecord[];
  preferences: { models: Partial<ModelChoice> };
}
