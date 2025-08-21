import { test, expect } from '@playwright/test';

test.describe('Sandbox Hello World Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/introduction/hello-world/');
  });

  test('Sandbox page loads', async ({ page }) => {
    await expect(page).toHaveTitle('Hello World 📚 Qwik Documentation');
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

  test('Hello world app loads', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const appText = page
      .getByRole('main')
      .locator('iframe')
      .contentFrame()
      .locator('iframe')
      .contentFrame()
      .getByText('Hello Qwik');
    await expect(appText).toBeVisible();
  });

  test('Hello World app.tsx loads', async ({ page }) => {
    const text = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: 'return <p>Hello Qwik</p>;' })
      .nth(4);
    await expect(text).toBeVisible();
  });

  test('Hello World update p tag', async ({ page }) => {
    const text = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: 'return <p>Hello Qwik</p>;' })
      .nth(4);
    await expect(text).toBeVisible();
    await text.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    await page.keyboard.type('return <p>Hello Test 1234</p>;');
    await expect(text).not.toBeVisible();

    const appText = page
      .getByRole('main')
      .locator('iframe')
      .first()
      .contentFrame()
      .locator('iframe')
      .first()
      .contentFrame()
      .getByText('Hello Test 1234');
    await expect(appText).toBeVisible();
  });

  test('Hello World entry.server.tsx tab works', async ({ page }) => {
    const button = page.getByRole('button', { name: 'entry.server.tsx' });
    await expect(button).toBeVisible();
    await button.click();

    const root = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "import { Root } from './root';" })
      .nth(4);
    await expect(root).toBeVisible();
  });

  test('Hello World root.tsx tab works', async ({ page }) => {
    const button = page.getByRole('button', { name: 'root.tsx' });
    await expect(button).toBeVisible();
    await button.click();
    const app = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "import App from './app';" })
      .nth(4);
    await expect(app).toBeVisible();
  });

  test('Hello world HTML Button', async ({ page }) => {
    const htmlButton = page.getByRole('button', { name: 'HTML' });
    await expect(htmlButton).toBeVisible();
    await htmlButton.click();
    const htmlCode = page.locator('code.language-html');
    await expect(htmlCode).toBeVisible();
    await expect(htmlCode).toContainText('<!DOCTYPE html>');
  });

  test('Hello world Symbols Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Symbols' });
    await expect(button).toBeVisible();
    await button.click();

    const symbolsText = page.getByText('import { _jsxQ } from');
    await expect(symbolsText).toBeVisible();
  });

  test('Hello world Client Bundles Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Client Bundles' });
    await expect(button).toBeVisible();
    await button.click();
    const bundles = page.locator('#file-modules-client-modules').getByText('build/app.js');
    await expect(bundles).toBeVisible();
  });

  test('Hello world SSR Module Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'SSR Module' });
    await expect(button).toBeVisible();
    await button.click();
    const module = page.locator('#file-modules-client-modules').getByText('entry.server.js');
    await expect(module).toBeVisible();
  });

  test('Hello world Diagnostics Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Diagnostics' });
    await expect(button).toBeVisible();
    await button.click();
    const diagnostics = page.locator('.output-result.output-diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toHaveText('- No Reported Diagnostics -');
  });

  test('Hello world Console', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Console' });
    await expect(button).toBeVisible();
    const serverConsoleText = page.getByText('🔴 Paused in server');
    await expect(serverConsoleText).toBeVisible();
  });

  test('Hello world Options Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Options' });
    await expect(button).toBeVisible();
    await button.click();
    const serverConsoleText = page.getByText('🔴 Paused in server');
    await expect(serverConsoleText).not.toBeVisible();
    const DebugCheckBox = page.locator('label').filter({ hasText: 'Debug' });
    await expect(DebugCheckBox).toBeVisible();
    await expect(DebugCheckBox).not.toBeChecked();
  });
});

test.describe('Sandbox Runtime-less Example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/introduction/runtime-less/');
  });
  test('Sandbox Runtime-less page loads', async ({ page }) => {
    await expect(page).toHaveTitle('Runtime-less 📚 Qwik Documentation');
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

    const consoleLogSSR = page.getByText('ssr render <App>');
    await expect(consoleLogSSR).toHaveCount(1);
    await expect(consoleLogSSR).toBeVisible();
  });

  test('Runtime-less APP.tsx loads', async ({ page }) => {
    const replInputAppTsx = page
      .getByRole('code')
      .locator('div')
      .filter({ hasText: "console.log('render <App>');" })
      .nth(4);
    await expect(replInputAppTsx).toBeVisible();
    const serverEntryButton = page.getByRole('button', { name: 'entry.server.tsx' });
    serverEntryButton.click();
    await expect(replInputAppTsx).not.toBeVisible();
    const appTsxButton = page.getByRole('button', { name: 'app.tsx' });
    appTsxButton.click();
    await expect(replInputAppTsx).toBeVisible();
  });

  test('Runtime-less entry.server.tsx loads', async ({ page }) => {
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

  test('Runtime-less root.tsx loads', async ({ page }) => {
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

  test('Runtime-less Action Button', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const button = page
      .locator('iframe')
      .contentFrame()
      .locator('iframe')
      .contentFrame()
      .getByRole('button', { name: 'Action' });
    await button.click();
    const clicked = page.getByText('client click');
    await expect(clicked).toHaveCount(1);
    await button.click();
    await expect(clicked).toHaveCount(2);
  });
  test('Runtime-less HTML Button', async ({ page }) => {
    const spinner = page.locator('.repl-spinner');
    await expect(spinner).toBeVisible();
    await expect(spinner).not.toBeVisible();
    const button = page.getByRole('button', { name: 'HTML' });
    await button.click();
    const htmlCode = page.locator('code.language-html');
    await expect(htmlCode).toBeVisible();
    await expect(htmlCode).toContainText('<!DOCTYPE html>');
  });

  test('Runtime-less Symbols Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Symbols' });
    await expect(button).toBeVisible();
    await button.click();

    const symbolsText = page.getByText('import { _jsxQ } from');
    await expect(symbolsText).toBeVisible();
  });

  test('Runtime-less Client Bundles Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Client Bundles' });
    await expect(button).toBeVisible();
    await button.click();
    const bundles = page.locator('#file-modules-client-modules').getByText('build/app.js');
    await expect(bundles).toBeVisible();
  });

  test('Runtime-less SSR Module Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'SSR Module' });
    await expect(button).toBeVisible();
    await button.click();
    const module = page.locator('#file-modules-client-modules').getByText('entry.server.js');
    await expect(module).toBeVisible();
  });

  test('Runtime-less Diagnostics Button', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Diagnostics' });
    await expect(button).toBeVisible();
    await button.click();
    const diagnostics = page.locator('.output-result.output-diagnostics');
    await expect(diagnostics).toBeVisible();
    await expect(diagnostics).toHaveText('- No Reported Diagnostics -');
  });

  test('Runtime-less Options Button', async ({ page }) => {
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
