import type {
  CoverLetterDocument,
  Profile,
  ResumeDocument,
} from './types';

const groundedTextSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: ['text', 'sourceIds', 'userEdited'] as const,
  properties: {
    text: { type: 'string' as const },
    sourceIds: { type: 'array' as const, items: { type: 'string' as const } },
    userEdited: { type: ['boolean', 'null'] as const },
  },
};

const linkSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: ['id', 'label', 'url'] as const,
  properties: {
    id: { type: ['string', 'null'] as const },
    label: { type: 'string' as const },
    url: { type: 'string' as const },
  },
};

/** Parse output: profile fields without IDs or timestamps. */
export const parseOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'basics',
    'headline',
    'summary',
    'roles',
    'education',
    'projects',
    'skills',
    'certifications',
    'languages',
  ],
  properties: {
    basics: {
      type: 'object',
      additionalProperties: false,
      required: ['fullName', 'email', 'phone', 'location', 'links'],
      properties: {
        fullName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: ['string', 'null'] },
        location: { type: ['string', 'null'] },
        links: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'url'],
            properties: {
              label: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
    headline: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'] },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'company',
          'title',
          'location',
          'startDate',
          'endDate',
          'current',
          'bullets',
        ],
        properties: {
          company: { type: 'string' },
          title: { type: 'string' },
          location: { type: ['string', 'null'] },
          startDate: { type: 'string' },
          endDate: { type: ['string', 'null'] },
          current: { type: 'boolean' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'institution',
          'qualification',
          'field',
          'startDate',
          'endDate',
          'details',
        ],
        properties: {
          institution: { type: 'string' },
          qualification: { type: 'string' },
          field: { type: ['string', 'null'] },
          startDate: { type: ['string', 'null'] },
          endDate: { type: ['string', 'null'] },
          details: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'url', 'description', 'bullets'],
        properties: {
          name: { type: 'string' },
          url: { type: ['string', 'null'] },
          description: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    skills: { type: 'array', items: { type: 'string' } },
    certifications: { type: 'array', items: { type: 'string' } },
    languages: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const interviewOutputSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: ['reply', 'proposedProfile', 'changes', 'complete'] as const,
  properties: {
    reply: { type: 'string' as const },
    proposedProfile: { type: ['object', 'null'] as const },
    changes: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    complete: { type: 'boolean' as const },
  },
} as const;

export const analyzeOutputSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: [
    'title',
    'company',
    'requirements',
    'keywords',
    'matchScore',
    'gaps',
  ] as const,
  properties: {
    title: { type: 'string' as const },
    company: { type: 'string' as const },
    requirements: { type: 'array' as const, items: { type: 'string' as const } },
    keywords: { type: 'array' as const, items: { type: 'string' as const } },
    matchScore: {
      type: 'integer' as const,
      minimum: 0 as const,
      maximum: 100 as const,
    },
    gaps: { type: 'array' as const, items: { type: 'string' as const } },
  },
} as const;

export const tailorOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['resume', 'coverLetter', 'changeSummary'],
  properties: {
    resume: {
      type: 'object',
      additionalProperties: false,
      required: [
        'basics',
        'headline',
        'summary',
        'roles',
        'education',
        'projects',
        'skills',
        'certifications',
        'languages',
      ],
      properties: {
        basics: {
          type: 'object',
          additionalProperties: false,
          required: ['fullName', 'email', 'phone', 'location', 'links'],
          properties: {
            fullName: { type: 'string' },
            email: { type: 'string' },
            phone: { type: ['string', 'null'] },
            location: { type: ['string', 'null'] },
            links: { type: 'array', items: linkSchema },
          },
        },
        headline: { anyOf: [groundedTextSchema, { type: 'null' }] },
        summary: { anyOf: [groundedTextSchema, { type: 'null' }] },
        roles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'sourceRoleId',
              'company',
              'title',
              'location',
              'dateRange',
              'bullets',
            ],
            properties: {
              sourceRoleId: { type: 'string' },
              company: { type: 'string' },
              title: { type: 'string' },
              location: { type: ['string', 'null'] },
              dateRange: { type: 'string' },
              bullets: { type: 'array', items: groundedTextSchema },
            },
          },
        },
        education: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'sourceEducationId',
              'institution',
              'qualification',
              'field',
              'dateRange',
              'details',
            ],
            properties: {
              sourceEducationId: { type: 'string' },
              institution: { type: 'string' },
              qualification: { type: 'string' },
              field: { type: ['string', 'null'] },
              dateRange: { type: 'string' },
              details: { type: 'array', items: groundedTextSchema },
            },
          },
        },
        projects: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'sourceProjectId',
              'name',
              'url',
              'description',
              'bullets',
            ],
            properties: {
              sourceProjectId: { type: 'string' },
              name: { type: 'string' },
              url: { type: ['string', 'null'] },
              description: groundedTextSchema,
              bullets: { type: 'array', items: groundedTextSchema },
            },
          },
        },
        skills: { type: 'array', items: groundedTextSchema },
        certifications: { type: 'array', items: groundedTextSchema },
        languages: { type: 'array', items: groundedTextSchema },
      },
    },
    coverLetter: {
      type: 'object',
      additionalProperties: false,
      required: ['greeting', 'paragraphs', 'signoff'],
      properties: {
        greeting: { type: 'string' },
        paragraphs: { type: 'array', items: groundedTextSchema },
        signoff: { type: 'string' },
      },
    },
    changeSummary: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected object`);
  }
}

export function assertParseOutput(value: unknown): asserts value is Record<string, unknown> {
  assertObject(value, 'parse output');
  for (const key of [
    'basics',
    'headline',
    'summary',
    'roles',
    'education',
    'projects',
    'skills',
    'certifications',
    'languages',
  ] as const) {
    if (!(key in value)) throw new Error(`Invalid parse output: missing ${key}`);
  }
}

export function assertInterviewOutput(value: unknown): asserts value is {
  reply: string;
  proposedProfile: Profile | null;
  changes: string[];
  complete: boolean;
} {
  assertObject(value, 'interview output');
  if (typeof value.reply !== 'string') throw new Error('Invalid interview output: reply');
  if (typeof value.complete !== 'boolean') throw new Error('Invalid interview output: complete');
  if (!Array.isArray(value.changes)) throw new Error('Invalid interview output: changes');
}

export function assertAnalyzeOutput(value: unknown): asserts value is {
  title: string;
  company: string;
  requirements: string[];
  keywords: string[];
  matchScore: number;
  gaps: string[];
} {
  assertObject(value, 'analyze output');
  if (typeof value.title !== 'string') throw new Error('Invalid analyze output: title');
  if (typeof value.company !== 'string') throw new Error('Invalid analyze output: company');
  if (!Array.isArray(value.requirements)) throw new Error('Invalid analyze output: requirements');
  if (!Array.isArray(value.keywords)) throw new Error('Invalid analyze output: keywords');
  if (!Array.isArray(value.gaps)) throw new Error('Invalid analyze output: gaps');
  if (
    typeof value.matchScore !== 'number' ||
    !Number.isInteger(value.matchScore) ||
    value.matchScore < 0 ||
    value.matchScore > 100
  ) {
    throw new Error('Invalid analyze output: matchScore');
  }
}

export function assertTailorOutput(value: unknown): asserts value is {
  resume: ResumeDocument;
  coverLetter: CoverLetterDocument;
  changeSummary: string[];
} {
  assertObject(value, 'tailor output');
  assertObject(value.resume, 'tailor resume');
  assertObject(value.coverLetter, 'tailor coverLetter');
  if (!Array.isArray(value.changeSummary)) {
    throw new Error('Invalid tailor output: changeSummary');
  }
}
