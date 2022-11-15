import { expect, test } from '@playwright/test';

test.describe('Qwik City API', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
});

function tests() {
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

  test('Page route, accept application/javascript', async ({ page: api }) => {
    await api.route('/qwikcity-test/products/hat', (route, request) => {
      route.continue({
        headers: {
          ...request.headers(),
          accept: 'application/json',
        },
      });
    });

    const rsp = (await api.goto('/qwikcity-test/products/hat'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const clientData = await rsp.json();
    expect(clientData.body.productId).toBe('hat');
    expect(clientData.body.price).toBe('$21.96');
    expect(clientData.prefetch).toBeDefined();
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
}
