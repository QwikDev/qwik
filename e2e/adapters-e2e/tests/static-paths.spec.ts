import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('..', import.meta.url));
// Matches the assets dir the playwright config built the app with, if any.
const assetsDir = process.env.ADAPTERS_E2E_ASSETS_DIR;
const urlPrefix = assetsDir ? `/${assetsDir}` : '';

test.describe('static paths', () => {
  test('serves robots.txt from the site root', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBeTruthy();
    expect((await response.text()).trim()).toBe('User-agent: *\nAllow: /');
  });

  test('references and serves the imported svg from the assets dir', async ({ page, request }) => {
    await page.goto('/');
    const src = await page.getByAltText('circle').getAttribute('src');
    expect(src).toMatch(new RegExp(`^${urlPrefix}/assets/.+\\.svg$`));
    const response = await request.get(src!);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain('<circle');
  });

  test('serves js bundles from the build dir', async ({ request }) => {
    const buildDir = join(appDir, 'dist', ...(assetsDir ? [assetsDir] : []), 'build');
    const chunk = (await readdir(buildDir)).find((fileName) => fileName.endsWith('.js'));
    expect(chunk).toBeTruthy();
    const response = await request.get(`${urlPrefix}/build/${chunk}`);
    expect(response.ok()).toBeTruthy();
  });

  test('resumes interactivity with served bundles', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'click me' }).click();
    await expect(page.getByTestId('hi')).toBeVisible();
  });

  test('injects root-relative static paths into the server bundle', async () => {
    const serverDir = join(appDir, 'server');
    const files = (await readdir(serverDir)).filter((fileName) => fileName.endsWith('.js'));
    const code = (
      await Promise.all(files.map((fileName) => readFile(join(serverDir, fileName), 'utf-8')))
    ).join('\n');
    expect(code).toContain('"/robots.txt"');
    if (assetsDir) {
      expect(code).toContain(`"${urlPrefix}/build/"`);
      expect(code).not.toContain(`${urlPrefix}${urlPrefix}/`);
    }
  });

  test('keeps prerendered pages on disk and serves them', async ({ page }) => {
    test.skip(!assetsDir, 'prerendering is configured on the assetsDir variant only');
    expect(existsSync(join(appDir, 'dist', 'profile', 'index.html'))).toBe(true);
    expect(existsSync(join(appDir, 'dist', 'loaders', 'index.html'))).toBe(true);
    await page.goto('/profile/');
    await expect(page.getByRole('heading', { name: 'Profile page' })).toBeVisible();
  });

  test('serves the prerendered loader sidecar', async ({ request }) => {
    test.skip(!assetsDir, 'prerendering is configured on the assetsDir variant only');
    const subpageDir = join(appDir, 'dist', 'loaders', 'subpage');
    const sidecar = (await readdir(subpageDir)).find((fileName) =>
      /^q-loader-.+\.json$/.test(fileName)
    );
    expect(sidecar).toBeTruthy();
    const response = await request.get(`/loaders/subpage/${sidecar}`);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain('42');
  });
});
