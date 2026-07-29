import { expect, test, type Page } from '@playwright/test';
import { JobStatus, KeyStorageMode } from '../../lib/types';

const profile = {
  id: 1,
  basics: { fullName: 'Alex Rivera', email: 'alex@example.com', links: [] },
  roles: [
    {
      id: 'role-1',
      company: 'Northwind Labs',
      title: 'Platform Engineer',
      startDate: '2021-03',
      current: true,
      bullets: [{ id: 'bullet-1', text: 'Automated delivery.' }],
    },
  ],
  education: [],
  projects: [],
  skills: [{ id: 'skill-1', text: 'TypeScript' }],
  certifications: [],
  languages: [],
  updatedAt: 1,
};
const model = {
  id: 'test-model',
  display_name: 'Test model',
  max_input_tokens: 100_000,
  max_tokens: 8_192,
  capabilities: {
    structured_outputs: { supported: true },
    pdf_input: { supported: true },
    effort: {
      supported: true,
      low: { supported: true },
      medium: { supported: true },
      high: { supported: true },
      xhigh: null,
      max: { supported: false },
    },
    thinking: {
      supported: false,
      types: {
        adaptive: { supported: false },
        enabled: { supported: false },
      },
    },
  },
};
const tailoring = {
  resume: {
    basics: profile.basics,
    headline: { text: 'Platform Engineer', sourceIds: ['role-1'] },
    summary: {
      text: 'Platform engineer',
      sourceIds: ['role-1'],
      userEdited: false,
    },
    roles: [
      {
        sourceRoleId: 'role-1',
        company: 'Northwind Labs',
        title: 'Platform Engineer',
        location: null,
        dateRange: '2021-03 – Present',
        bullets: [
          {
            text: 'Automated delivery.',
            sourceIds: ['bullet-1'],
            userEdited: false,
          },
        ],
      },
    ],
    education: [],
    projects: [],
    skills: [{ text: 'TypeScript', sourceIds: ['skill-1'], userEdited: false }],
    certifications: [],
    languages: [],
  },
  coverLetter: {
    greeting: 'Dear hiring team,',
    paragraphs: [
      {
        text: 'I automated delivery.',
        sourceIds: ['bullet-1'],
        userEdited: false,
      },
    ],
    signoff: 'Sincerely,',
  },
  changeSummary: ['Highlighted delivery automation.'],
};

async function seed(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByLabel('Paste job description')).toBeVisible();
  await page.evaluate(
    ({ savedProfile, savedModel, keyStorage }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('career-genie');
        request.onerror = () => reject(request.error ?? new Error('open failed'));
        request.onsuccess = () => {
          const db = request.result;
          if (
            !db.objectStoreNames.contains('profiles') ||
            !db.objectStoreNames.contains('settings')
          ) {
            reject(new Error('Dexie stores missing'));
            return;
          }
          const transaction = db.transaction(['profiles', 'settings'], 'readwrite');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('tx failed'));
          transaction.objectStore('profiles').put(savedProfile);
          transaction.objectStore('settings').put({
            id: 1,
            keyStorage,
            plaintextKey: 'mock-key',
            models: {
              parse: savedModel.id,
              interview: savedModel.id,
              analyze: savedModel.id,
              tailor: savedModel.id,
            },
            updatedAt: Date.now(),
          });
        };
      }),
    {
      savedProfile: profile,
      savedModel: model,
      keyStorage: KeyStorageMode.Plaintext,
    },
  );
}

function tailorWirePayload() {
  const { resume, coverLetter, changeSummary } = tailoring;
  return {
    resumeJson: JSON.stringify(resume),
    coverLetterJson: JSON.stringify(coverLetter),
    changeSummary,
  };
}

async function mockAnthropic(page: Page): Promise<void> {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().url().includes('/v1/models')) {
      await route.fulfill({
        json: { data: [model], has_more: false, last_id: null },
      });
      return;
    }
    const wire = tailorWirePayload();
    await route.fulfill({
      json: {
        id: 'message-test',
        type: 'message',
        role: 'assistant',
        model: model.id,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(wire) }],
        parsed_output: wire,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
  });
}

test('creates, filters, versions, and downloads a tailored job', async ({ page }) => {
  await mockAnthropic(page);
  await seed(page);
  await page.goto('/dashboard');
  await page.getByLabel('Paste job description').fill('A platform engineering role.');
  await page.getByRole('button', { name: 'Create without analysis' }).click();
  await page.getByLabel('Title').fill('Platform engineer');
  await page.getByLabel('Company').fill('Example Co');
  await page.getByRole('button', { name: 'Save job' }).click();
  await page.getByLabel('Search jobs').fill('Example');
  await page.getByRole('link', { name: 'Review job' }).click();
  await page.getByLabel('Application status').click();
  await page.getByRole('option', { name: JobStatus.Applied }).click();
  await expect(page.getByText('Status saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('New AI version saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.getByRole('button', { name: /v2 · ai/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in new tab' })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Print PDF' })).toHaveCount(2);
});

test('shows a safe refusal state', async ({ page }) => {
  await mockAnthropic(page);
  await seed(page);
  await page.evaluate(
    (status) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('career-genie');
        request.onerror = () => reject(request.error ?? new Error('open failed'));
        request.onsuccess = () => {
          const transaction = request.result.transaction('jobs', 'readwrite');
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error('tx failed'));
          transaction.objectStore('jobs').put({
            id: 'job-refusal',
            title: 'Role',
            company: 'Company',
            description: 'Text',
            requirements: [],
            keywords: [],
            status,
            matchScore: 0,
            gaps: [],
            createdAt: 1,
            updatedAt: 1,
          });
        };
      }),
    JobStatus.Saved,
  );
  await page.route('https://api.anthropic.com/v1/messages', (route) =>
    route.fulfill({
      json: {
        id: 'message-refusal',
        type: 'message',
        role: 'assistant',
        model: model.id,
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      },
    }),
  );
  await page.goto('/jobs/job-refusal');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('Claude could not process this request.')).toBeVisible();
});
