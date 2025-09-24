import { test, expect } from '@playwright/test';

test.describe('Sandbox Partials HackerNews Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/partial/hackernews-index/');
  });

  test('Partial HackerNews page loads', async ({ page }) => {
    await expect(page).toHaveTitle('HackerNews 📚 Qwik Documentation');
    const tabButtonsTop = page.getByText('app.tsxentry.server.tsxhacker');

    await expect(tabButtonsTop.getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'app.tsx' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'hacker-news.css' })).toBeVisible();
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

  test('Partial HackerNews app.tsx loads', async ({ page }) => {
    const replInputAppTsx = page
      .getByRole('code')
      .getByText('export const HackerNews = component$');
    await expect(replInputAppTsx).toBeVisible();
    const serverEntryButton = page.getByRole('button', { name: 'entry.server.tsx' });
    serverEntryButton.click();
    await expect(replInputAppTsx).not.toBeVisible();
    const appTsxButton = page.getByRole('button', { name: 'app.tsx' });
    appTsxButton.click();
    await expect(replInputAppTsx).toBeVisible();
  });

  test('Partial HackerNews entry.server.tsx loads', async ({ page }) => {
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

  test('Partial HackerNews root.tsx loads', async ({ page }) => {
    const importStatement = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "import { HackerNews } from './app';" })
      .nth(4);
    await expect(importStatement).not.toBeVisible();
    const button = page.getByRole('button', { name: 'root.tsx' });
    await button.click();
    await expect(importStatement).toBeVisible();
  });

  test('Partial HackerNews hacker-news.css loads', async ({ page }) => {
    const clockCSS = page.getByText('background-color: #f2f3f5;');
    const button = page.getByRole('button', { name: 'hacker-news.css' });
    await expect(clockCSS).not.toBeVisible();
    button.click();
    await expect(clockCSS).toBeVisible();
  });

  test('Partial HackerNews fetchRequest Loads', async ({ page }) => {
    const linkToNextPage = page
      .locator('iframe')
      .contentFrame()
      .locator('iframe')
      .contentFrame()
      .getByRole('link', { name: 'Next Page' });
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    await expect(linkToNextPage).toBeVisible();
  });

  test('Partial HackerNews HTML Button', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const button = page.getByRole('button', { name: 'HTML' });
    await button.click();
    const htmlCode = page.locator('code.language-html');
    await expect(htmlCode).toBeVisible();
    await expect(htmlCode).toContainText('<!DOCTYPE html>');
  });

  test('Partial HackerNews Symbols Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Symbols' });
    await expect(button).toBeVisible();
    await button.click();

    const symbolsText = page.getByText('import { _jsxQ } from').first();
    await expect(symbolsText).toBeVisible();
  });

  test('Partial HackerNews Client Bundles Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Client Bundles' });
    await expect(button).toBeVisible();
    await button.click();
    const bundles = page.locator('#file-modules-client-modules').getByText('build/app.js');
    await expect(bundles).toBeVisible();
  });

  test('Partial HackerNews SSR Module Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'SSR Module' });
    await expect(button).toBeVisible();
    await button.click();
    const module = page.locator('#file-modules-client-modules').getByText('entry.server.js');
    await expect(module).toBeVisible();
  });

  test('Partial HackerNews Diagnostics Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Diagnostics' });
    await expect(button).toBeVisible();
    await button.click();
    const diagnostics = page.locator('.output-result.output-diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toHaveText('- No Reported Diagnostics -');
  });

  test('Clock Options Button', async ({ page }) => {
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
