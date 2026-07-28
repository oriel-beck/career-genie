import type {
  CoverLetterDocument,
  GroundedText,
  Profile,
  ResumeDocument,
} from './types';

function optionalString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid ${label}: expected string`);
  return value === '' ? undefined : value;
}

function parseSourceIds(value: unknown, label: string): string[] {
  if (typeof value === 'string') {
    return value.split(',').map((id) => id.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}.sourceIds`);
  return value.map((id, index) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error(`Invalid ${label}.sourceIds[${index}]`);
    return id.trim();
  });
}

function parseGroundedText(value: unknown, label: string): GroundedText {
  assertObject(value, label);
  if (typeof value.text !== 'string') throw new Error(`Invalid ${label}.text`);
  return {
    text: value.text,
    sourceIds: parseSourceIds(value.sourceIds, label),
    userEdited: false,
  };
}

function parseJsonObject(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error(`Invalid ${label}: expected JSON string`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${label}: malformed JSON`);
  }
  assertObject(parsed, label);
  return parsed;
}

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

/**
 * Wire schema for Anthropic structured outputs. A nested Profile object is
 * rejected unless every object sets additionalProperties:false, and a full
 * Profile schema inflates grammar size — keep the profile as a JSON string.
 */
export const interviewOutputSchema = {
  type: 'object' as const,
  additionalProperties: false as const,
  required: ['reply', 'questions', 'proposedProfileJson', 'changes', 'complete'] as const,
  properties: {
    reply: { type: 'string' as const },
    questions: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    proposedProfileJson: { type: ['string', 'null'] as const },
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
    'description',
    'requirements',
    'keywords',
    'matchScore',
    'gaps',
  ] as const,
  properties: {
    title: { type: 'string' as const },
    company: { type: 'string' as const },
    description: { type: 'string' as const },
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

/**
 * Wire schema for Anthropic structured outputs. Nested resume/cover schemas
 * compile past their grammar size limit; keep this flat and validate JSON
 * payloads in assertTailorOutput instead.
 */
export const tailorOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['resumeJson', 'coverLetterJson', 'changeSummary'],
  properties: {
    resumeJson: { type: 'string' },
    coverLetterJson: { type: 'string' },
    changeSummary: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Inner JSON shapes expected inside resumeJson / coverLetterJson. */
export const TAILOR_JSON_SHAPE = [
  'resumeJson object: { basics:{fullName,email,phone,location,links:[{id,label,url}]},',
  'headline:{text,sourceIds[]}, summary:{text,sourceIds[]},',
  'roles:[{sourceRoleId,company,title,location,dateRange,bullets:[{text,sourceIds[]}]}],',
  'education:[{sourceEducationId,institution,qualification,field,dateRange,details:[{text,sourceIds[]}]}],',
  'projects:[{sourceProjectId,name,url,description:{text,sourceIds[]},bullets:[{text,sourceIds[]}]}],',
  'skills/certifications/languages:[{text,sourceIds[]}] }',
  'coverLetterJson object: { greeting, paragraphs:[{text,sourceIds[]}], signoff }',
  'Use "" for absent optional strings. sourceIds must be non-empty arrays of profile IDs only.',
].join(' ');

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
  questions: string[];
  proposedProfile: Profile | null;
  changes: string[];
  complete: boolean;
} {
  assertObject(value, 'interview output');
  if (typeof value.reply !== 'string') throw new Error('Invalid interview output: reply');
  if (typeof value.complete !== 'boolean') throw new Error('Invalid interview output: complete');
  if (!Array.isArray(value.questions)) throw new Error('Invalid interview output: questions');
  value.questions.forEach((item, index) => {
    if (typeof item !== 'string') throw new Error(`Invalid interview output: questions[${index}]`);
  });
  if (!Array.isArray(value.changes)) throw new Error('Invalid interview output: changes');
  value.changes.forEach((item, index) => {
    if (typeof item !== 'string') throw new Error(`Invalid interview output: changes[${index}]`);
  });

  if (value.proposedProfileJson === null) {
    value.proposedProfile = null;
  } else if (typeof value.proposedProfileJson === 'string') {
    if (!value.proposedProfileJson.trim()) {
      value.proposedProfile = null;
    } else {
      value.proposedProfile = parseJsonObject(
        value.proposedProfileJson,
        'interview proposedProfileJson',
      ) as unknown as Profile;
    }
  } else {
    throw new Error('Invalid interview output: proposedProfileJson');
  }
  delete value.proposedProfileJson;
}

export function assertAnalyzeOutput(value: unknown): asserts value is {
  title: string;
  company: string;
  description: string;
  requirements: string[];
  keywords: string[];
  matchScore: number;
  gaps: string[];
} {
  assertObject(value, 'analyze output');
  if (typeof value.title !== 'string') throw new Error('Invalid analyze output: title');
  if (typeof value.company !== 'string') throw new Error('Invalid analyze output: company');
  if (typeof value.description !== 'string') throw new Error('Invalid analyze output: description');
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
  if (!Array.isArray(value.changeSummary)) {
    throw new Error('Invalid tailor output: changeSummary');
  }
  value.changeSummary.forEach((item, index) => {
    if (typeof item !== 'string') throw new Error(`Invalid tailor output: changeSummary[${index}]`);
  });

  const resumeRaw = parseJsonObject(value.resumeJson, 'tailor resumeJson');
  const coverRaw = parseJsonObject(value.coverLetterJson, 'tailor coverLetterJson');

  assertObject(resumeRaw.basics, 'tailor resume.basics');
  if (typeof resumeRaw.basics.fullName !== 'string') throw new Error('Invalid tailor resume.basics.fullName');
  if (typeof resumeRaw.basics.email !== 'string') throw new Error('Invalid tailor resume.basics.email');
  if (!Array.isArray(resumeRaw.basics.links)) throw new Error('Invalid tailor resume.basics.links');

  const resume: ResumeDocument = {
    basics: {
      fullName: resumeRaw.basics.fullName,
      email: resumeRaw.basics.email,
      phone: optionalString(resumeRaw.basics.phone, 'tailor resume.basics.phone'),
      location: optionalString(resumeRaw.basics.location, 'tailor resume.basics.location'),
      links: resumeRaw.basics.links.map((link, index) => {
        assertObject(link, `tailor resume.basics.links[${index}]`);
        if (typeof link.id !== 'string' || typeof link.label !== 'string' || typeof link.url !== 'string') {
          throw new Error(`Invalid tailor resume.basics.links[${index}]`);
        }
        return { id: link.id, label: link.label, url: link.url };
      }),
    },
    headline: parseGroundedText(resumeRaw.headline, 'tailor resume.headline'),
    summary: parseGroundedText(resumeRaw.summary, 'tailor resume.summary'),
    roles: [],
    education: [],
    projects: [],
    skills: [],
    certifications: [],
    languages: [],
  };

  if (!Array.isArray(resumeRaw.roles)) throw new Error('Invalid tailor resume.roles');
  resume.roles = resumeRaw.roles.map((role, index) => {
    assertObject(role, `tailor resume.roles[${index}]`);
    if (!Array.isArray(role.bullets)) throw new Error(`Invalid tailor resume.roles[${index}].bullets`);
    return {
      sourceRoleId: String(role.sourceRoleId),
      company: String(role.company),
      title: String(role.title),
      location: optionalString(role.location, `tailor resume.roles[${index}].location`),
      dateRange: String(role.dateRange),
      bullets: role.bullets.map((bullet, bulletIndex) =>
        parseGroundedText(bullet, `tailor resume.roles[${index}].bullets[${bulletIndex}]`),
      ),
    };
  });

  if (!Array.isArray(resumeRaw.education)) throw new Error('Invalid tailor resume.education');
  resume.education = resumeRaw.education.map((item, index) => {
    assertObject(item, `tailor resume.education[${index}]`);
    if (!Array.isArray(item.details)) throw new Error(`Invalid tailor resume.education[${index}].details`);
    return {
      sourceEducationId: String(item.sourceEducationId),
      institution: String(item.institution),
      qualification: String(item.qualification),
      field: optionalString(item.field, `tailor resume.education[${index}].field`),
      dateRange: String(item.dateRange),
      details: item.details.map((detail, detailIndex) =>
        parseGroundedText(detail, `tailor resume.education[${index}].details[${detailIndex}]`),
      ),
    };
  });

  if (!Array.isArray(resumeRaw.projects)) throw new Error('Invalid tailor resume.projects');
  resume.projects = resumeRaw.projects.map((project, index) => {
    assertObject(project, `tailor resume.projects[${index}]`);
    if (!Array.isArray(project.bullets)) throw new Error(`Invalid tailor resume.projects[${index}].bullets`);
    return {
      sourceProjectId: String(project.sourceProjectId),
      name: String(project.name),
      url: optionalString(project.url, `tailor resume.projects[${index}].url`),
      description: parseGroundedText(project.description, `tailor resume.projects[${index}].description`),
      bullets: project.bullets.map((bullet, bulletIndex) =>
        parseGroundedText(bullet, `tailor resume.projects[${index}].bullets[${bulletIndex}]`),
      ),
    };
  });

  for (const key of ['skills', 'certifications', 'languages'] as const) {
    if (!Array.isArray(resumeRaw[key])) throw new Error(`Invalid tailor resume.${key}`);
    resume[key] = resumeRaw[key].map((item, index) =>
      parseGroundedText(item, `tailor resume.${key}[${index}]`),
    );
  }

  if (typeof coverRaw.greeting !== 'string' || typeof coverRaw.signoff !== 'string') {
    throw new Error('Invalid tailor coverLetter greeting/signoff');
  }
  if (!Array.isArray(coverRaw.paragraphs)) throw new Error('Invalid tailor coverLetter.paragraphs');
  const coverLetter: CoverLetterDocument = {
    greeting: coverRaw.greeting,
    signoff: coverRaw.signoff,
    paragraphs: coverRaw.paragraphs.map((paragraph, index) =>
      parseGroundedText(paragraph, `tailor coverLetter.paragraphs[${index}]`),
    ),
  };

  delete value.resumeJson;
  delete value.coverLetterJson;
  value.resume = resume;
  value.coverLetter = coverLetter;
}
