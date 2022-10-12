import { test, expect } from '@playwright/test';

test.describe('effect-client', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/effect-client');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const container = page.locator('#container');
    const counter = page.locator('#counter');
    const msg = page.locator('#msg');
    const msgEager = page.locator('#eager-msg');
    const msgClientSide1 = page.locator('#client-side-msg-1');
    const msgClientSide2 = page.locator('#client-side-msg-2');
    const msgClientSide3 = page.locator('#client-side-msg-3');

    await expect(container).not.hasAttribute('data-effect');
    await expect(counter).toHaveText('0');
    await expect(msg).toHaveText('empty');
    await expect(msgEager).toHaveText('run');
    await expect(msgClientSide1).toHaveText('run');
    await expect(msgClientSide2).toHaveText('run');
    await expect(msgClientSide3).toHaveText('run');

    await counter.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);

    await expect(container).toHaveAttribute('data-effect', 'true');
    await expect(counter).toHaveText('10');
    await expect(msg).toHaveText('run');

    await page.waitForTimeout(500);
    await expect(container).toHaveAttribute('data-effect', 'true');
    await expect(counter).toHaveText('11');
    await expect(msg).toHaveText('run');
  });
});
