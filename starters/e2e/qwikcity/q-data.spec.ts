import { expect, test } from '@playwright/test';

test.describe('Qwik City q-data', () => {
  test('Page q-data.json route', async ({ page: api }) => {
    const rsp = (await api.goto('/qwikcity-test/products/hat/q-data.json'))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()['content-type']).toBe('application/json; charset=utf-8');

    const qData = await rsp.json();
    expect(qData.loaders).toBeDefined();
    expect(Object.keys(qData.loaders)).toHaveLength(3);

    let productLoader: any = null;
    for (const loaderId in qData.loaders) {
      const loader = qData.loaders[loaderId];
      if (loader.productId) {
        productLoader = loader;
      }
    }
    expect(productLoader.productId).toBe('hat');
    expect(productLoader.price).toBe('$21.96');
  });
});
