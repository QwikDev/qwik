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

// Twin scenarios run in both streaming modes so in-order/out-of-order parity cannot drift.
export const streamingModes = [
  { mode: 'in-order', outOfOrder: false },
  { mode: 'out-of-order', outOfOrder: true },
] as const;

export const streamingUrl = (
  scenario: string | null,
  outOfOrder: boolean,
  basePath = '/e2e/error-boundary-streaming'
) => {
  const params = new URLSearchParams();
  if (scenario) {
    params.set('scenario', scenario);
  }
  if (!outOfOrder) {
    params.set('outOfOrder', 'false');
  }
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ''}`;
};
