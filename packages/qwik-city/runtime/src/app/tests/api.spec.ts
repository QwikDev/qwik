import { expect, test } from '@playwright/test';
import type { ClientPageData } from '../../library/types';

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

  const clientData: ClientPageData = await rsp.json();
  expect(clientData.body.productId).toBe('hat');
  expect(clientData.body.price).toBe('$21.96');
  expect(clientData.prefetch).toBeDefined();
});

test('Page q-data.json route', async ({ page: api }) => {
  const rsp = (await api.goto('/products/hat/q-data.json'))!;
  expect(rsp.status()).toBe(200);
  expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

  const clientData: ClientPageData = await rsp.json();
  expect(clientData.body.productId).toBe('hat');
  expect(clientData.body.price).toBe('$21.96');
  expect(clientData.prefetch).toBeDefined();
});
