import { expect, test } from '@playwright/test';

const COLLECTOR_URL = 'http://localhost:3301/qwikrouter-test/insights-collect/';

// API-level e2e (no browser): the client tracker beacons here in production; verify the Qwik Router
// route accepts a payload and hands it to the collector without error.
test('insights collector route accepts a beacon', async ({ request }) => {
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

  const response = await request.post(COLLECTOR_URL, { data: beacon });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test('insights collector route swallows a malformed beacon', async ({ request }) => {
  const response = await request.post(COLLECTOR_URL, {
    headers: { 'content-type': 'application/json' },
    data: 'not-json',
  });

  // handleInsightsBeacon never throws, so the route still replies 200.
  expect(response.status()).toBe(200);
});
