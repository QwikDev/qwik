import { test, expect, type Page } from '@playwright/test';

const getRenderIds = async (selector: string, page: Page) => {
  return page.locator(`${selector} [data-render-id]`).evaluateAll((nodes) => {
    return Object.fromEntries(
      nodes.map((node) => [
        (node as HTMLElement).id,
        (node as HTMLElement).getAttribute('data-render-id'),
      ])
    );
  });
};

test.describe('each', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/each');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests() {
    test('should render basic and long each examples', async ({ page }) => {
      await expect(page.locator('#render-basic-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await expect(page.locator('#render-long-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
        'Hello d',
        'Hello e',
        'Hello f',
        'Hello g',
        'Hello h',
        'Hello i',
        'Hello j',
      ]);
    });

    test('should update signal and store each items', async ({ page }) => {
      await expect(page.locator('#signal-update-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#signal-update-button').click();
      await expect(page.locator('#signal-update-loop > div')).toHaveText([
        'Hello d',
        'Hello e',
        'Hello f',
      ]);

      await expect(page.locator('#store-update-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#store-update-button').click();
      await expect(page.locator('#store-update-loop > div')).toHaveText([
        'Hello d',
        'Hello e',
        'Hello f',
      ]);
    });

    test('should keep reused keyed rows unchanged when signal or store item content changes', async ({
      page,
    }) => {
      const signalBefore = await getRenderIds('#signal-keyed-loop', page);
      await expect(page.locator('#signal-keyed-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#signal-keyed-button').click();
      await expect(page.locator('#signal-keyed-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      expect(await getRenderIds('#signal-keyed-loop', page)).toEqual(signalBefore);

      const storeBefore = await getRenderIds('#store-keyed-loop', page);
      await expect(page.locator('#store-keyed-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#store-keyed-button').click();
      await expect(page.locator('#store-keyed-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      expect(await getRenderIds('#store-keyed-loop', page)).toEqual(storeBefore);
    });

    test('should swap keyed signal and store rows without re-rendering the rest', async ({
      page,
    }) => {
      const signalBefore = await getRenderIds('#signal-swap-loop', page);
      await expect(page.locator('#signal-swap-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#signal-swap-button').click();
      await expect(page.locator('#signal-swap-loop > div')).toHaveText([
        'Hello c',
        'Hello b',
        'Hello a',
      ]);
      expect(await getRenderIds('#signal-swap-loop', page)).toEqual(signalBefore);

      const storeBefore = await getRenderIds('#store-swap-loop', page);
      await expect(page.locator('#store-swap-loop > div')).toHaveText([
        'Hello a',
        'Hello b',
        'Hello c',
      ]);
      await page.locator('#store-swap-button').click();
      await expect(page.locator('#store-swap-loop > div')).toHaveText([
        'Hello c',
        'Hello b',
        'Hello a',
      ]);
      expect(await getRenderIds('#store-swap-loop', page)).toEqual(storeBefore);
    });
  }

  tests();

  test.describe('client rerender', () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator('#force-rerender');
      await toggleRender.click();
      await expect(page.locator('#render-count')).toHaveText('1');
    });

    tests();
  });
});
