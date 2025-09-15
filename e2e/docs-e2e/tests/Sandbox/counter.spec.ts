import { test, expect } from '@playwright/test';

test.describe('Sandbox Counter Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/reactivity/counter/');
  });

  test('Sandbox Counter page loads', async ({ page }) => {
    await expect(page).toHaveTitle('Counter 📚 Qwik Documentation');
    const tabButtonsTop = page.getByText('app.tsxentry.server.tsxroot.');

    await expect(tabButtonsTop.getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'app.tsx' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'entry.server.tsx' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'root.tsx' })).toBeVisible();

    const tabButtonsBottom = page.getByText('AppHTMLSymbolsClient');
    await expect(tabButtonsBottom.getByRole('button')).toHaveCount(6);

    await expect(tabButtonsBottom.getByRole('button', { name: 'App' })).toBeVisible();
    await expect(tabButtonsBottom.getByRole('button', { name: 'HTML' })).toBeVisible();
    await expect(tabButtonsBottom.getByRole('button', { name: 'Symbols' })).toBeVisible();
    await expect(tabButtonsBottom.getByRole('button', { name: 'Client Bundles' })).toBeVisible();
    await expect(tabButtonsBottom.getByRole('button', { name: 'SSR Module' })).toBeVisible();
    await expect(tabButtonsBottom.getByRole('button', { name: 'Diagnostics' })).toBeVisible();

    const consoleTabBottom = page.getByText('ConsoleOptions');
    await expect(consoleTabBottom.getByRole('button')).toHaveCount(2);
    await expect(consoleTabBottom.getByRole('button', { name: 'Console' })).toBeVisible();
    await expect(consoleTabBottom.getByRole('button', { name: 'Options' })).toBeVisible();
  });

  test('Counter app.tsx loads', async ({ page }) => {
    const replInputAppTsx = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: 'export default component$' })
      .nth(4);
    await expect(replInputAppTsx).toBeVisible();
    const serverEntryButton = page.getByRole('button', { name: 'entry.server.tsx' });
    serverEntryButton.click();
    await expect(replInputAppTsx).not.toBeVisible();
    const appTsxButton = page.getByRole('button', { name: 'app.tsx' });
    appTsxButton.click();
    await expect(replInputAppTsx).toBeVisible();
  });

  test('Counter entry.server.tsx loads', async ({ page }) => {
    const root = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "import { Root } from './root';" })
      .nth(4);

    await expect(root).not.toBeVisible();
    const button = page.getByRole('button', { name: 'entry.server.tsx' });
    button.click();
    await expect(root).toBeVisible();
  });

  test('Counter root.tsx loads', async ({ page }) => {
    const importStatement = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "import App from './app';" })
      .nth(4);
    await expect(importStatement).not.toBeVisible();
    const button = page.getByRole('button', { name: 'root.tsx' });
    await button.click();
    await expect(importStatement).toBeVisible();
  });

  test('Counter Click Button', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const countValue = page
      .locator('iframe')
      .contentFrame()
      .locator('iframe')
      .contentFrame()
      .locator('main>p')
      .first();
    const button = page
      .locator('iframe')
      .contentFrame()
      .locator('iframe')
      .contentFrame()
      .getByRole('button', { name: 'Click' });
    const resumed = page.getByText('🟢 Resumed in client');
    await expect(resumed).not.toBeVisible();
    await expect(countValue).toHaveText('Count: 0');
    await button.click();

    await expect(countValue).toHaveText('Count: 1');
    await expect(resumed).toBeVisible();
  });

  test('Counter HTML Button', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const button = page.getByRole('button', { name: 'HTML' });
    await button.click();
    const htmlCode = page.locator('code.language-html');
    await expect(htmlCode).toBeVisible();
    await expect(htmlCode).toContainText('<!DOCTYPE html>');
  });

  test('Counter Symbols Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Symbols' });
    await expect(button).toBeVisible();
    await button.click();

    const symbolsText = page.getByText('import { _jsxQ } from');
    await expect(symbolsText).toBeVisible();
  });

  test('Counter Client Bundles Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Client Bundles' });
    await expect(button).toBeVisible();
    await button.click();
    const bundles = page.locator('#file-modules-client-modules').getByText('build/app.js');
    await expect(bundles).toBeVisible();
  });

  test('Counter SSR Module Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'SSR Module' });
    await expect(button).toBeVisible();
    await button.click();
    const module = page.locator('#file-modules-client-modules').getByText('entry.server.js');
    await expect(module).toBeVisible();
  });

  test('Counter Diagnostics Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Diagnostics' });
    await expect(button).toBeVisible();
    await button.click();
    const diagnostics = page.locator('.output-result.output-diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toHaveText('- No Reported Diagnostics -');
  });

  test('Counter Options Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Options' });
    const serverConsoleText = page.getByText('🔴 Paused in server');
    await expect(serverConsoleText).toBeVisible();
    await expect(button).toBeVisible();
    await button.click();
    await expect(serverConsoleText).not.toBeVisible();
    const DebugCheckBox = page.locator('label').filter({ hasText: 'Debug' });
    await expect(DebugCheckBox).toBeVisible();
    await expect(DebugCheckBox).not.toBeChecked();
    const consoleButton = page.getByRole('button', { name: 'Console' });
    consoleButton.click();
    await expect(serverConsoleText).toBeVisible();
  });
});
