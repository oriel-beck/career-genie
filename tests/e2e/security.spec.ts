import { expect, test } from '@playwright/test';

test('renders posting markup as text and provides a paste fallback', async ({ page }) => {
  await page.goto('/dashboard');
  const posting = '<img src=x onerror="window.__xss = true"><script>window.__xss = true</script>';
  await page.getByLabel('Paste job description').fill(posting);
  await page.getByRole('button', { name: 'Create without analysis' }).click();
  await page.getByLabel('Title').fill('Security engineer');
  await page.getByLabel('Company').fill('Example Co');
  await page.getByRole('button', { name: 'Save job' }).click();
  await expect(page.locator('.job-card')).toContainText(posting);
  expect(await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss)).toBeUndefined();

  await page.route('**/api/fetch-job', (route) => route.fulfill({ status: 502, json: { error: 'blocked' } }));
  await page.getByLabel('Job URL (optional)').fill('https://example.com/job');
  await page.getByRole('button', { name: 'Import URL' }).click();
  await expect(page.getByText('Could not import that URL. Paste the job text below instead.')).toBeVisible();
  await expect(page.getByLabel('Paste job description')).toBeFocused();
});
