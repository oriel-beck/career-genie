import { expect, test, type Page } from '@playwright/test';

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

async function mockAnthropic(page: Page): Promise<void> {
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().url().includes('/v1/models')) {
      await route.fulfill({ json: { data: [model], has_more: false, last_id: null } });
      return;
    }
    await route.fulfill({
      status: 500,
      json: { error: { message: 'Unexpected mocked Anthropic call' } },
    });
  });
}

test('shows only the unsupported browser screen when a capability is missing', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'showDirectoryPicker', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, 'FileSystemDirectoryHandle', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'This browser is not supported' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});

test('encrypted key validation persists ciphertext and starts locked after reload', async ({
  page,
}) => {
  await mockAnthropic(page);
  await page.goto('/settings');
  await page.getByLabel('Anthropic API key').fill('test-key-not-real');
  await page.getByLabel('Passphrase').fill('correct horse battery staple');
  await page.getByRole('button', { name: 'Validate and save key' }).click();
  await expect(
    page.getByText('Key storage updated and key validated. Models defaulted for each task.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Unlock passphrase')).toBeVisible();
  const stored = await page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('career-genie');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('settings', 'readonly');
          const get = transaction.objectStore('settings').get(1);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
      }),
  );
  expect(JSON.stringify(stored)).not.toContain('test-key-not-real');
});
