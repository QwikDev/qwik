import { test, expect } from '@playwright/test';

test.describe('resource', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/resource');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const resource1 = page.locator('.resource1');
    const logs = page.locator('.logs');
    const increment = page.locator('button.increment');
    let logsContent =
      '[RENDER] <ResourceApp>\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
    await expect(resource1).toHaveText('resource 1 is 80');
    // await expect(resource2).toHaveText('resource 2 is 160');
    await expect(logs).toHaveText(logsContent);

    // Increment
    await increment.click();
    await page.waitForTimeout(400);

    logsContent +=
      '[RESOURCE] 1 after\n\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
    await expect(resource1).toHaveText('loading resource 1...');
    // await expect(resource2).toHaveText('loading resource 2...');
    await expect(logs).toHaveText(logsContent);

    // Wait until finish loading
    await page.waitForTimeout(1000);

    logsContent += '[RESOURCE] 1 after\n[RENDER] <Results>\n\n\n';
    await expect(resource1).toHaveText('resource 1 is 88');
    // await expect(resource2).toHaveText('resource 2 is 176');
    await expect(logs).toHaveText(logsContent);
  });

  test('should track subscriptions', async ({ page }) => {
    const resource1 = page.locator('.resource1');
    const logs = page.locator('.logs');
    let logsContent =
      '[RENDER] <ResourceApp>\n[WATCH] 1 before\n[WATCH] 1 after\n[WATCH] 2 before\n[WATCH] 2 after\n[RESOURCE] 1 before\n[RENDER] <Results>\n\n\n';
    await expect(resource1).toHaveText('resource 1 is 80');
    await expect(logs).toHaveText(logsContent);

    // Count
    const countBtn = page.locator('button.count');
    await expect(countBtn).toHaveText('count is 0');
    await countBtn.click();
    await expect(countBtn).toHaveText('count is 1');

    logsContent += '[RESOURCE] 1 after\n[RENDER] <Results>\n\n\n';
    await expect(logs).toHaveText(logsContent);

    await countBtn.click();
    await expect(countBtn).toHaveText('count is 2');

    logsContent += '[RENDER] <Results>\n\n\n';
    await expect(logs).toHaveText(logsContent);
  });
});

test.describe('resource serialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/resource-serialization');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });

  test('should load', async ({ page }) => {
    const button1 = page.locator('button.r1');
    const button2 = page.locator('button.r2');
    const button3 = page.locator('button.r3');

    await expect(button1).toHaveText('PASS: Success 0');
    await expect(button2).toHaveText('ERROR: Error: failed 0');
    await expect(button3).toHaveText('ERROR: Error: timeout 0');

    // Click button 1
    await button1.click();

    await expect(button1).toHaveText('PASS: Success 1');
    await expect(button2).toHaveText('ERROR: Error: failed 0');
    await expect(button3).toHaveText('ERROR: Error: timeout 0');

    // Click button 2
    await button2.click();

    await expect(button1).toHaveText('PASS: Success 1');
    await expect(button2).toHaveText('ERROR: Error: failed 1');
    await expect(button3).toHaveText('ERROR: Error: timeout 1');

    // Click button 2
    await button2.click();

    await expect(button1).toHaveText('PASS: Success 1');
    await expect(button2).toHaveText('ERROR: Error: failed 2');
    await expect(button3).toHaveText('ERROR: Error: timeout 2');
  });
});
