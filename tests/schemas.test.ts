import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTailorOutput, tailorOutputSchema } from '../lib/schemas';

test('tailorOutputSchema stays flat for Anthropic grammar limits', () => {
  assert.deepEqual(Object.keys(tailorOutputSchema.properties).sort(), [
    'changeSummary',
    'coverLetterJson',
    'resumeJson',
  ]);
  assert.equal(tailorOutputSchema.properties.resumeJson.type, 'string');
  assert.equal(tailorOutputSchema.properties.coverLetterJson.type, 'string');
});

test('assertTailorOutput parses JSON string payloads into app documents', () => {
  const resume = {
    basics: {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
      location: 'London',
      links: [{ id: 'link-1', label: 'GitHub', url: 'https://github.com/ada' }],
    },
    headline: { text: 'Engineer', sourceIds: ['headline-1'] },
    summary: { text: 'Builder', sourceIds: ['summary-1', 'role-1'] },
    roles: [{
      sourceRoleId: 'role-1',
      company: 'Analytical Engine Co',
      title: 'Engineer',
      location: '',
      dateRange: '1842 – Present',
      bullets: [{ text: 'Wrote programs', sourceIds: ['bullet-1'] }],
    }],
    education: [],
    projects: [{
      sourceProjectId: 'proj-1',
      name: 'Notes',
      url: '',
      description: { text: 'Research notes', sourceIds: ['proj-desc-1'] },
      bullets: [{ text: 'Published algorithms', sourceIds: ['proj-bullet-1'] }],
    }],
    skills: [{ text: 'Mathematics', sourceIds: ['skill-1'] }],
    certifications: [],
    languages: [{ text: 'English', sourceIds: ['lang-1'] }],
  };
  const coverLetter = {
    greeting: 'Dear Hiring Manager,',
    paragraphs: [{ text: 'I am interested.', sourceIds: 'bullet-1, role-1' }],
    signoff: 'Sincerely,\nAda',
  };
  const raw: Record<string, unknown> = {
    resumeJson: JSON.stringify(resume),
    coverLetterJson: JSON.stringify(coverLetter),
    changeSummary: ['Emphasized analytical work'],
  };

  assertTailorOutput(raw);

  assert.equal('resumeJson' in raw, false);
  assert.equal('coverLetterJson' in raw, false);
  assert.equal(raw.resume.basics.phone, undefined);
  assert.equal(raw.resume.basics.location, 'London');
  assert.deepEqual(raw.resume.headline, {
    text: 'Engineer',
    sourceIds: ['headline-1'],
    userEdited: false,
  });
  assert.equal(raw.resume.roles[0]?.location, undefined);
  assert.deepEqual(raw.resume.roles[0]?.bullets[0], {
    text: 'Wrote programs',
    sourceIds: ['bullet-1'],
    userEdited: false,
  });
  assert.equal(raw.resume.projects[0]?.url, undefined);
  assert.deepEqual(raw.coverLetter.paragraphs[0]?.sourceIds, ['bullet-1', 'role-1']);
});
