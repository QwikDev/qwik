import { expect, test } from '@playwright/test';

test.describe('performance counter', () => {
  test.use({ baseURL: 'http://localhost:3301' });
  test.setTimeout(120_000);
  test('removes a row on the first event after SSR', async ({ page }) => {
    await page.goto('/perf.prod/');
    const rows = page.locator('tbody > tr');
    await expect(rows).toHaveCount(1000);
    const id = await rows.nth(500).locator('td').first().textContent();
    await rows.nth(500).locator('td').nth(2).locator('a').dispatchEvent('click');
    await expect(rows).toHaveCount(999);
    await expect(
      page.locator('tbody > tr > td:first-child').filter({ hasText: new RegExp(`^${id}$`) })
    ).toHaveCount(0);
  });
  test('updates every tenth SSR label on the first event', async ({ page }) => {
    await page.goto('/perf.prod/');
    const labels = page.locator('tbody > tr > td:nth-child(2) > a');
    await expect(labels).toHaveCount(1000);
    const before = await labels.allTextContents();
    const textNodes = await page.evaluateHandle(() =>
      [...document.querySelectorAll('tbody > tr > td:nth-child(2) > a')].map(
        (label) => label.firstChild
      )
    );
    try {
      await page.locator('#update').click();
      await expect
        .poll(() => labels.allTextContents())
        .toEqual(before.map((label, index) => (index % 10 === 0 ? label + ' !!!' : label)));
      expect(
        await page.evaluate(
          (nodes) =>
            [...document.querySelectorAll('tbody > tr > td:nth-child(2) > a')].every(
              (label, index) => label.firstChild === nodes[index]
            ),
          textNodes
        )
      ).toBe(true);
    } finally {
      await textNodes.dispose();
    }
  });

  test('creates CSR rows without loading another handler chunk', async ({ page }) => {
    await page.goto('/perf.prod/?csr=1', { waitUntil: 'networkidle' });
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') {
        scripts.push(request.url());
      }
    });
    await page.locator('#runlots').click();
    await expect(page.locator('tbody > tr')).toHaveCount(10_000);
    expect(scripts).toEqual([]);
  });

  test('swaps SSR rows without recreating them', async ({ page }) => {
    await page.goto('/perf.prod/');
    const rows = page.locator('tbody > tr');
    await expect(rows).toHaveCount(1_000);
    const secondId = await rows.nth(1).locator('td').first().textContent();
    const replacementId = await rows.nth(998).locator('td').first().textContent();
    const originalRows = await page.evaluateHandle(() =>
      Array.from(document.querySelector('tbody')!.children)
    );
    try {
      await page.locator('#swaprows').click();
      await expect(rows.nth(1).locator('td').first()).toHaveText(replacementId!);
      await expect(rows.nth(998).locator('td').first()).toHaveText(secondId!);
      expect(
        await page.evaluate(
          (before) =>
            Array.from(document.querySelector('tbody')!.children).every(
              (row, index) => row === before[index === 1 ? 998 : index === 998 ? 1 : index]
            ),
          originalRows
        )
      ).toBe(true);
      await rows.nth(1).locator('td').nth(1).locator('a').click();
      await expect(rows.nth(1)).toHaveClass(/danger/);
      await rows.nth(998).locator('td').nth(1).locator('a').click();
      await expect(rows.nth(998)).toHaveClass(/danger/);
      await expect(rows.nth(1)).not.toHaveClass(/danger/);
      await rows.nth(998).locator('td').nth(2).locator('span').dispatchEvent('click');
      await expect(rows).toHaveCount(999);
    } finally {
      await originalRows.dispose();
    }
  });
  for (const mode of ['csr', 'resume']) {
    test(`preserves keyed row behavior in ${mode}`, async ({ page }) => {
      await page.goto(`/perf.prod/${mode === 'csr' ? '?csr=1' : ''}`);
      const rows = page.locator('tbody > tr');

      if (mode === 'csr') {
        await expect(rows).toHaveCount(0);
        await page.locator('#run').click();
      }
      await expect(rows).toHaveCount(1_000);
      if (mode === 'resume') {
        await expect(rows.first().locator('td').nth(1).locator('a')).toHaveAttribute(
          'q:p',
          /^\d+$/
        );
      }
      await rows.first().locator('td').nth(1).locator('a').click();
      await expect(rows.first()).toHaveClass(/danger/);
      await rows.nth(1).locator('td').nth(1).locator('a').click();
      await expect(rows.first()).not.toHaveClass(/danger/);
      await expect(rows.nth(1)).toHaveClass(/danger/);
      await expect(page.locator('tbody > tr.danger')).toHaveCount(1);
      await rows.first().locator('td').nth(1).locator('a').click();
      await expect(rows.first()).toHaveClass(/danger/);
      const firstLabel = rows.first().locator('td').nth(1).locator('a');
      const labelText = await firstLabel.evaluateHandle((element) => element.firstChild);
      const classChanges = await rows.first().evaluateHandle((element) => {
        const changes: MutationRecord[] = [];
        const observer = new MutationObserver((records) => changes.push(...records));
        observer.observe(element, { attributes: true, attributeFilter: ['class'] });
        return { changes, observer };
      });
      await page.locator('#update').click();
      await expect(rows.first().locator('td').nth(1)).toContainText('!!!');
      expect(await classChanges.evaluate(({ changes }) => changes.length)).toBe(0);
      await classChanges.evaluate(({ observer }) => observer.disconnect());
      await classChanges.dispose();
      expect(
        await firstLabel.evaluate((element, text) => element.firstChild === text, labelText)
      ).toBe(true);
      await labelText.dispose();
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

      await rows.first().locator('td').nth(2).locator('a').dispatchEvent('click');
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
