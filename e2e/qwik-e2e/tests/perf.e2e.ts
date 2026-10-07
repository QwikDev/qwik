import { expect, test } from '@playwright/test';

test.describe('performance counter', () => {
  test.use({ baseURL: 'http://localhost:3301' });
  test.setTimeout(120_000);
  test('removes a row on the first event after SSR', async ({ page }) => {
    await page.goto('/perf.prod/');
    const rows = page.locator('tbody > tr');
    await expect(rows).toHaveCount(1000);
    const id = await rows.nth(500).locator('td').first().textContent();
    await rows.nth(500).locator('td').nth(2).locator('span').click();
    await expect(rows).toHaveCount(999);
    await expect(
      page.locator('tbody > tr > td:first-child').filter({ hasText: new RegExp(`^${id}$`) })
    ).toHaveCount(0);
  });
  for (const mode of ['csr', 'resume']) {
    test(`preserves keyed row behavior in ${mode}`, async ({ page }) => {
      await page.goto(`/perf.prod/${mode === 'csr' ? '?csr=1' : ''}`);
      const rows = page.locator('tbody > tr');

      await expect(rows).toHaveCount(1_000);
      if (mode === 'resume') {
        await expect(rows.first().locator('td').nth(1).locator('a')).toHaveAttribute(
          'q:p',
          /^\d+$/
        );
      }
      await rows.first().locator('td').nth(1).locator('a').click();
      await expect(rows.first()).toHaveClass(/danger/);
      await page.locator('#update').click();
      await expect(rows.first().locator('td').nth(1)).toContainText('!!!');
      await page.locator('#clear').click();
      await expect(rows).toHaveCount(0);

      await page.locator('#runlots').click();
      await expect(rows).toHaveCount(10_000, { timeout: 120_000 });

      const secondId = await rows.nth(1).locator('td').first().textContent();
      const replacementId = await rows.nth(998).locator('td').first().textContent();
      await page.locator('#swaprows').click();
      await expect(rows.nth(1).locator('td').first()).toHaveText(replacementId!);
      await expect(rows.nth(998).locator('td').first()).toHaveText(secondId!);

      await page.locator('#update').click();
      await expect(rows.first().locator('td').nth(1)).toContainText('!!!');
      await expect(rows.nth(1).locator('td').nth(1)).not.toContainText('!!!');
      await expect(rows.nth(10).locator('td').nth(1)).toContainText('!!!');

      await rows.first().locator('td').nth(1).locator('a').click();
      await expect(rows.first()).toHaveClass(/danger/);

      await rows.first().locator('td').nth(2).locator('a').click();
      await expect(rows).toHaveCount(9_999);

      await page.locator('#clear').click();
      await expect(rows).toHaveCount(0);

      await page.locator('#runlots').click();
      await expect(rows).toHaveCount(10_000, { timeout: 120_000 });
      await rows.first().locator('td').nth(1).locator('a').click();
      await expect(rows.first()).toHaveClass(/danger/);
    });
  }
});
