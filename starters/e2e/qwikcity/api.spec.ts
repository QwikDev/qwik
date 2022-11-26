import { expect, test } from '@playwright/test';

test.describe('Qwik City API', () => {
  test('Qwik City API', async ({ page: api }) => {
    const rsp = (await api.goto('/qwikcity-test/api/data.json'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const data = await rsp.json();
    expect(data.method).toBe('GET');
    expect(data.node).toBe(process.versions.node);
  });

  test('Qwik City API, params', async ({ page: api }) => {
    const rsp = (await api.goto('/qwikcity-test/api/builder.io/oss.json'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const data = await rsp.json();
    expect(data.method).toBe('GET');
    expect(data.node).toBe(process.versions.node);
    expect(data.params.org).toBe('builder.io');
    expect(data.params.user).toBe('oss');
  });

  test('Page route GET, accept application/javascript', async ({ page: api }) => {
    await api.route('/qwikcity-test/products/hat/', (route, request) => {
      route.continue({
        headers: {
          ...request.headers(),
          accept: 'application/json',
        },
      });
    });

    const rsp = (await api.goto('/qwikcity-test/products/hat/'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const clientData = await rsp.json();
    expect(clientData.productId).toBe('hat');
    expect(clientData.price).toBe('$21.96');
  });

  test('Page q-data.json route', async ({ page: api }) => {
    const rsp = (await api.goto('/qwikcity-test/products/hat/q-data.json'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const clientData = await rsp.json();
    expect(clientData.body.productId).toBe('hat');
    expect(clientData.body.price).toBe('$21.96');
    expect(clientData.prefetch).toBeDefined();
  });

  test('PUT endpoint on page', async ({ page }) => {
    const rsp = (await page.goto('/qwikcity-test/api/'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('text/html; charset=utf-8');

    const btnPut = page.locator('[data-test-api-onput]');
    expect(await btnPut.textContent()).toBe('onPut');
    await btnPut.click();
    await page.waitForSelector('.onput-success');
    expect(await btnPut.textContent()).toBe('PUT test');
  });

  test('POST endpoint on page', async ({ page }) => {
    const rsp = (await page.goto('/qwikcity-test/api/'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('text/html; charset=utf-8');

    const btnPut = page.locator('[data-test-api-onpost]');
    expect(await btnPut.textContent()).toBe('onPost (accept: application/json)');
    await btnPut.click();
    await page.waitForSelector('.onpost-success');
    expect(await btnPut.textContent()).toBe('POST test');
  });
});
