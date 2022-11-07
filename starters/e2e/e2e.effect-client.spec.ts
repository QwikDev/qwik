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

  test('issue 1717', async ({ page }) => {
    const value1 = page.locator('#issue-1717-value1');
    const value2 = page.locator('#issue-1717-value2');
    const meta = page.locator('#issue-1717-meta');
    await expect(value1).toHaveText('value 1');
    await expect(value2).toHaveText('value 2');
    await expect(meta).toHaveText('Sub: 10 Renders: 2');
  });

  test('issue 2015', async ({ page }) => {
    const order = page.locator('#issue-2015-order');
    await page.waitForTimeout(300);
    await expect(order).toHaveText('Order: start 1 finish 1 start 2 finish 2 start 3 finish 3');
  });
});
