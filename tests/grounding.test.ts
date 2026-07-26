import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  collectProfileSourceIds,
  validateGenerationGrounding,
} from '../lib/grounding';
import { extractJobText } from '../lib/job-text';
import type { CoverLetterDocument, Profile, ResumeDocument } from '../lib/types';

const profile = JSON.parse(
  readFileSync(path.join(process.cwd(), 'fixtures/profile.json'), 'utf8'),
) as Profile;

function baseResume(): ResumeDocument {
  return {
    basics: structuredClone(profile.basics),
    headline: {
      text: 'Platform engineer',
      sourceIds: ['headline-1'],
    },
    summary: {
      text: 'Reliable delivery platforms.',
      sourceIds: ['summary-1'],
    },
    roles: [
      {
        sourceRoleId: 'role-1',
        company: profile.roles[0]!.company,
        title: profile.roles[0]!.title,
        location: profile.roles[0]!.location,
        dateRange: '2021-03 — Present',
        bullets: [
          {
            text: 'Led migration of CI workloads onto managed containers.',
            sourceIds: ['bullet-1'],
          },
        ],
      },
    ],
    education: [
      {
        sourceEducationId: 'edu-1',
        institution: profile.education[0]!.institution,
        qualification: profile.education[0]!.qualification,
        field: profile.education[0]!.field,
        dateRange: '2012-08 — 2016-05',
        details: [
          {
            text: 'Focus on distributed systems',
            sourceIds: ['edu-detail-1'],
          },
        ],
      },
    ],
    projects: [
      {
        sourceProjectId: 'proj-1',
        name: profile.projects[0]!.name,
        url: profile.projects[0]!.url,
        description: {
          text: profile.projects[0]!.description.text,
          sourceIds: ['proj-desc-1'],
        },
        bullets: [
          {
            text: profile.projects[0]!.bullets[0]!.text,
            sourceIds: ['proj-bullet-1'],
          },
        ],
      },
    ],
    skills: [{ text: 'TypeScript', sourceIds: ['skill-1'] }],
    certifications: [{ text: 'AWS Solutions Architect Associate', sourceIds: ['cert-1'] }],
    languages: [{ text: 'English', sourceIds: ['lang-1'] }],
  };
}

function baseCover(): CoverLetterDocument {
  return {
    greeting: 'Dear Hiring Manager,',
    paragraphs: [
      {
        text: 'I have shipped platform work at Northwind Labs.',
        sourceIds: ['bullet-1', 'role-1'],
      },
    ],
    signoff: 'Sincerely,\nAlex Rivera',
  };
}

test('collectProfileSourceIds gathers claim and entity ids', () => {
  const ids = collectProfileSourceIds(profile);
  assert.ok(ids.has('role-1'));
  assert.ok(ids.has('bullet-1'));
  assert.ok(ids.has('skill-1'));
  assert.ok(ids.has('proj-desc-1'));
});

test('accepts grounded AI output matching profile metadata', () => {
  assert.deepEqual(
    validateGenerationGrounding(profile, baseResume(), baseCover()),
    [],
  );
});

test('rejects empty and foreign source ids on AI blocks', () => {
  const resume = baseResume();
  resume.skills = [{ text: 'Kubernetes', sourceIds: [] }];
  assert.ok(
    validateGenerationGrounding(profile, resume, baseCover()).some(
      (error) => error.reason === 'empty sourceIds',
    ),
  );

  resume.skills = [{ text: 'Kubernetes', sourceIds: ['missing-id'] }];
  assert.ok(
    validateGenerationGrounding(profile, resume, baseCover()).some((error) =>
      error.reason.includes('foreign sourceId'),
    ),
  );
});

test('rejects metadata that differs from referenced profile entities', () => {
  const resume = baseResume();
  resume.roles[0]!.company = 'Not Northwind';
  assert.ok(
    validateGenerationGrounding(profile, resume, baseCover()).some(
      (error) => error.path.includes('company'),
    ),
  );
});

test('allows explicitly user-edited text blocks without sources', () => {
  const resume = baseResume();
  resume.skills = [{ text: 'Edited skill', sourceIds: [], userEdited: true }];
  assert.deepEqual(
    validateGenerationGrounding(profile, resume, baseCover()),
    [],
  );
});

test('job extraction returns collapsed plain text and never markup', () => {
  const previous = globalThis.DOMParser;
  globalThis.DOMParser = class {
    parseFromString(html: string) {
      const title = html.match(/<title>(.*?)<\/title>/i)?.[1] ?? '';
      const body = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
      return {
        querySelector: (selector: string) =>
          selector === 'title' ? { textContent: title } : null,
        body: { textContent: body },
      };
    }
  } as unknown as typeof DOMParser;
  try {
    const text = extractJobText(
      '<html><title>Role</title><body><h1>Engineer</h1><script>x()</script><p>Build things</p></body></html>',
      'text/html',
    );
    assert.equal(text.includes('<'), false);
    assert.equal(text.includes('x()'), false);
    assert.match(text, /Role/);
    assert.match(text, /Engineer/);
    assert.match(text, /Build things/);
  } finally {
    globalThis.DOMParser = previous;
  }
});
