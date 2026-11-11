import { expect, test } from '@playwright/test';

for (const variant of ['small', 'large', 'shared']) {
  test(`auto serialization resumes ${variant} loader values and preserves refresh`, async ({
    page,
  }) => {
    const needsFetch = variant === 'large';
    const requests: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().includes('/loaders/serialization-auto/q-loader-')) {
        requests.push(request.url());
      }
    });
    const response = await page.goto(
      `/qwikrouter-test/loaders/serialization-auto/${variant === 'small' ? '' : variant === 'large' ? '?large' : '?large&shared'}`
    );
    expect((await response!.text()).includes('auto-large-result')).toBe(variant === 'shared');
    const initial = await page.locator('#auto-label').textContent();
    await page.waitForFunction(() => !!(window as any)._qwikEv?.roots);
    await page.locator('#auto-read').click();
    await expect.poll(() => page.evaluate(() => (window as any).__autoRead)).toMatch(/^version-/);

    expect(requests).toHaveLength(needsFetch ? 1 : 0);
    if (needsFetch) {
      await expect(page.locator('#auto-label')).not.toHaveText(initial!);
    } else {
      await expect(page.locator('#auto-label')).toHaveText(initial!);
      expect(await page.evaluate(() => (window as any).__autoComputations)).toBeUndefined();
    }

    const beforeRefresh = await page.locator('#auto-label').textContent();
    await page.locator('#auto-refresh').click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__autoRefreshed))
      .toMatch(/^version-/);
    await expect(page.locator('#auto-label')).not.toHaveText(beforeRefresh!);
    expect(requests).toHaveLength(needsFetch ? 2 : 1);
    expect(await page.evaluate(() => (window as any).__autoComputations)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
