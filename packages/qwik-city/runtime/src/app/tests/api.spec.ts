import { expect, test } from '@playwright/test';

test('Qwik City API', async ({ page: api }) => {
  const rsp = (await api.goto('/api/data.json'))!;
  expect(rsp.status()).toBe(200);
  expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

  const data = await rsp.json();
  expect(data.method).toBe('GET');
  expect(data.node).toBe(process.versions.node);
});

test('Qwik City API, params', async ({ page: api }) => {
  const rsp = (await api.goto('/api/builder.io/oss.json'))!;
  expect(rsp.status()).toBe(200);
  expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

  const data = await rsp.json();
  expect(data.method).toBe('GET');
  expect(data.node).toBe(process.versions.node);
  expect(data.params.org).toBe('builder.io');
  expect(data.params.user).toBe('oss');
});

test('Page route, accept application/javascript', async ({ page: api }) => {
  await api.route('/products/hat', (route, request) => {
    route.continue({
      headers: {
        ...request.headers(),
        accept: 'application/json',
      },
    });
  });

  const rsp = (await api.goto('/products/hat'))!;
  expect(rsp.status()).toBe(200);
  expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

  const data = await rsp.json();
  expect(data.productId).toBe('hat');
  expect(data.price).toBe('$21.96');
});
