import { test, expect } from '@playwright/test';

test('ssr /', async ({ page }) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));

  const rsp = (await page.goto('/'))!;

  expect(rsp.status()).toBe(200);

  const html = page.locator('html');
  expect(await html.getAttribute('q:version')).toBeDefined();
  expect(await html.getAttribute('q:base')).toBeDefined();
  expect(await html.getAttribute('q:id')).toBeDefined();

  const head = html.locator('head');
  expect(await head.getAttribute('q:host')).toBeDefined();
  expect(await head.getAttribute('q:id')).toBeDefined();

  const title = head.locator('title');
  expect(await title.innerText()).toBe('Welcome to Qwik City - Qwik');

  const canonical = head.locator('link[rel="canonical"]');
  expect(await canonical.getAttribute('href')).toBe('http://localhost:3000/');

  const twitterTitle = head.locator('meta[name="twitter:title"]');
  expect(await twitterTitle.getAttribute('content')).toBe('Qwik');

  const body = html.locator('body');

  const rootLayout = body.locator('div.root-layout');

  const header = rootLayout.locator('header');
  const logo = header.locator('.logo a');
  expect(await logo.innerText()).toBe('Qwik City 🏙');

  const main = rootLayout.locator('main');
  const h1 = main.locator('h1');
  expect(await h1.innerText()).toBe('Welcome to Qwik City');
});
