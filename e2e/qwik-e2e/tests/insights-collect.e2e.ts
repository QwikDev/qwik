import { expect, test } from '@playwright/test';

const ORIGIN = 'http://localhost:3301';
const COLLECTOR_URL = `${ORIGIN}/qwikrouter-test/insights-collect/`;
// The router's CSRF check rejects mutating requests without a same-origin Origin header.
const headers = { origin: ORIGIN };

test('insights collector route records a browser beacon', async ({ page }) => {
  const beacon = {
    qVersion: '2',
    manifestHash: 'e2e',
    publicApiKey: 'e2ekey123',
    previousSymbol: null,
    symbols: [
      {
        symbol: 'chunk_alpha',
        route: '/',
        delay: 5,
        latency: 20,
        timeline: 100,
        interaction: false,
      },
      { symbol: 'chunk_beta', route: '/', delay: 8, latency: 15, timeline: 60, interaction: true },
    ],
  };

  await page.goto(`${ORIGIN}/qwikrouter-test/`);
  const responsePromise = page.waitForResponse(COLLECTOR_URL);
  // sendBeacon is what the tracker uses, so this covers the Origin header browsers send.
  const queued = await page.evaluate(
    ([url, body]) => navigator.sendBeacon(url, body),
    [COLLECTOR_URL, JSON.stringify(beacon)]
  );
  expect(queued).toBe(true);
  const response = await responsePromise;

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test('insights collector route swallows a malformed beacon', async ({ request }) => {
  const response = await request.post(COLLECTOR_URL, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: 'not-json',
  });

  // handleInsightsBeacon never throws, so the route still replies 200, but nothing is recorded.
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: false });
});

test('insights collector route records an error beacon', async ({ request }) => {
  const response = await request.post(`${COLLECTOR_URL}error/`, {
    headers,
    data: {
      publicApiKey: 'e2ekey123',
      manifestHash: 'e2e',
      url: 'http://localhost/',
      message: 'Uncaught Error: e2e',
    },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
