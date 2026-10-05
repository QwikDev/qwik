import { expect, test } from '@playwright/test';

test('serves independently bundled core and router apps in one process', async ({ request }) => {
  test.slow(true, 'First requests build three fixture apps.');
  for (const pathname of ['/e2e/', '/qwikrouter-test/', '/qwikrouter-test.prod/']) {
    const response = await request.get(pathname);
    expect(response.status()).toBe(200);
  }
});
