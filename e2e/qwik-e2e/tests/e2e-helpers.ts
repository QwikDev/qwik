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

/**
 * Replaces a string inside a serialized response body. The body is read and written with the
 * serializer, because binary state stores string lengths and a text replace would corrupt it.
 */
export const replaceSerializedString = async (
  body: string,
  from: string,
  to: string
): Promise<string> => {
  // The built core reads its feature flags at run time; match the format of the body.
  (globalThis as any).__EXPERIMENTAL__ = { binaryState: body.startsWith('~') };
  const { _deserialize } = await import('@qwik.dev/core/internal');
  const { _serialize } = await import('@qwik.dev/core/internal/serializer');
  const replaceIn = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(from, to);
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record);
      for (let i = 0; i < keys.length; i++) {
        record[keys[i]] = replaceIn(record[keys[i]]);
      }
    }
    return value;
  };
  return _serialize(replaceIn(await _deserialize(body)));
};
