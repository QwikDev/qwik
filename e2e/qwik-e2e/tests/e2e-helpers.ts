import { expect, type Page } from '@playwright/test';

export const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

export const collectPageErrors = (page: Page) => {
  const messages: string[] = [];
  page.on('pageerror', (err) => messages.push(err.message));
  return messages;
};

export const collectConsoleErrors = (page: Page) => {
  const messages: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      messages.push(msg.text());
    }
  });
  return messages;
};

export const releaseDeferred = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};
