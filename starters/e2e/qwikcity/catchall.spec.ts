import { expect, test } from '@playwright/test';
import { assertPage, linkNavigate, load, locator } from './util.js';

test.describe('Qwik City Catchall', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
});

function tests() {
  test('Handled Catchall', async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto('/qwikcity-test/catchall/'))!;
    const status = response.status();
    expect(status).toBe(200);
  });

  test('Aborted Catchall', async ({ context }) => {
    const page = await context.newPage();
    const response = (await page.goto('/qwikcity-test/catchall-abort/'))!;
    const status = response.status();
    expect(status).toBe(404);
  });
}
