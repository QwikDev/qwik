import { expect, type Page } from '@playwright/test';

export const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

export const releaseDeferred = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};

export const streamingModes = [
  { mode: 'in-order', outOfOrder: false },
  { mode: 'out-of-order', outOfOrder: true },
] as const;

type RouteApp = 'error-handling' | 'error-handling.prod';

export const routeUrl = (
  route: string,
  {
    outOfOrder = true,
    app = 'error-handling' as RouteApp,
    params = {},
  }: { outOfOrder?: boolean; app?: RouteApp; params?: Record<string, string> } = {}
) => {
  const search = new URLSearchParams();
  if (!outOfOrder) {
    search.set('outOfOrder', 'false');
  }
  for (const [key, value] of Object.entries(params)) {
    search.set(key, value);
  }
  const query = search.toString();
  return `/${app}/${route}${query ? `?${query}` : ''}`;
};
