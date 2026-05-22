import { expect, test, type APIRequestContext } from '@playwright/test';

type ProductProps = {
  productId: string;
  runId: string;
};

test.describe('cache registry prototype', () => {
  test('renders direct useAsync$(serverFn, props) edges and dedupes duplicate SSR resources', async ({
    page,
  }) => {
    const runId = uniqueRunId('page');
    const response = await page.goto(`/cache-registry-test/?run=${runId}`);

    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-test-page-run]')).toHaveText(runId);
    await expect(page.locator('[data-test-unregistered-card]')).toHaveText(
      'normal Qwik SSR still renders'
    );

    const first = page.locator('[data-test-card-wrapper="first"]');
    const second = page.locator('[data-test-card-wrapper="second"]');
    await expect(first.locator('[data-test-product-title]')).toHaveText('Mechanical Keyboard');
    await expect(second.locator('[data-test-product-title]')).toHaveText('Mechanical Keyboard');
    await expect(first.locator('[data-test-product-reads]')).toHaveText('product reads: 1');
    await expect(second.locator('[data-test-product-reads]')).toHaveText('product reads: 1');

    await page.locator('#client-rpc-button').click();
    await expect(page.locator('#client-rpc-result')).toHaveText('client reads: 1/1');
  });

  test('caches standalone qcomponent HTML by props and vary outputs', async ({ request }) => {
    const props = createProps('html-vary');
    const componentId = await getProductCardComponentId(request);
    const requests = [
      { plan: 'free', expectedCache: 'miss' },
      { plan: 'free', expectedCache: 'hit' },
      { plan: 'pro', expectedCache: 'miss' },
      { plan: 'pro', expectedCache: 'hit' },
    ] as const;

    for (const item of requests) {
      const response = await postProductCard(
        request,
        props,
        {
          accept: 'text/html',
          'x-cache-plan': item.plan,
        },
        undefined,
        componentId
      );
      const html = await response.text();

      expect(response.status()).toBe(200);
      expect(html, `rendered segment for plan=${item.plan}`).toContain(`plan: ${item.plan}`);
      expect(
        response.headers()['x-qwik-component-cache'],
        `component cache status for plan=${item.plan}`
      ).toBe(item.expectedCache);
      expect(html).toContain('Mechanical Keyboard');
    }
  });

  test('returns JSON qcomponent envelope with resume and resource metadata', async ({
    request,
  }) => {
    const props = createProps('json-envelope');
    const response = await postProductCard(request, props, {
      accept: 'application/json',
      'x-cache-plan': 'free',
    });
    const payload = await response.json();

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['x-qwik-component-cache']).toBe('miss');
    expect(payload).toMatchObject({
      type: 'qwik-component-partial',
      version: 1,
      standalone: true,
      mode: 'html',
      component: {
        id: 'ProductCard',
        name: 'ProductCard',
      },
      cache: {
        status: 'miss',
      },
      resume: {
        boundary: 'standalone-container',
        merge: 'none',
      },
    });
    expect(payload.html).toContain('Mechanical Keyboard');
    expect(payload.resources.length).toBeGreaterThanOrEqual(3);
    expect(payload.resources.every((resource: any) => !('value' in resource))).toBe(true);
    expect(payload.component).not.toHaveProperty('policy');
    expect(payload.cache).not.toHaveProperty('namespace');
  });

  test('returns data plus render-symbol payload without leaking metadata-only resources', async ({
    request,
  }) => {
    const props = createProps('data-payload');
    const response = await postProductCard(
      request,
      props,
      {
        'x-cache-plan': 'pro',
      },
      'qcomponent-payload=data'
    );
    const payload = await response.json();

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(payload).toMatchObject({
      type: 'qwik-component-partial',
      standalone: true,
      mode: 'data-plus-render-symbol',
      component: {
        id: 'ProductCard',
        name: 'ProductCard',
      },
      render: {
        componentId: 'ProductCard',
      },
      resume: {
        boundary: 'standalone-container',
        merge: 'none',
      },
    });
    expect(payload).not.toHaveProperty('html');
    expect(payload.render.ids).toContain('ProductCard');
    expect(payload.data.resources.some((resource: any) => resource.value?.kind === 'product')).toBe(
      true
    );
    expect(
      payload.data.resources.some(
        (resource: any) => resource.value?.kind === 'product' && resource.value.segment === 'pro'
      )
    ).toBe(true);
    expect(payload.data.resources.some((resource: any) => resource.value?.kind === 'pricing')).toBe(
      true
    );
    expect(
      payload.data.resources.some((resource: any) => resource.value?.kind === 'inventory')
    ).toBe(false);
    expect(payload.data.resources.some((resource: any) => !('value' in resource))).toBe(true);
    expect(payload.resources.every((resource: any) => !('value' in resource))).toBe(true);
  });

  test('does not expose unregistered components through qcomponent', async ({ request }) => {
    const response = await request.post('/cache-registry-test/?qcomponent=UnregisteredCard', {
      headers: {
        'content-type': 'application/json',
        'X-QCOMPONENT': 'UnregisteredCard',
      },
      data: {
        props: {},
      },
    });
    const body = await response.text();

    expect(response.status()).toBe(404);
    expect(body).toContain('Unknown cached component');
  });
});

const postProductCard = (
  request: APIRequestContext,
  props: ProductProps,
  headers: Record<string, string>,
  query = '',
  componentId = 'ProductCard'
) => {
  const suffix = query ? `&${query}` : '';
  const encodedComponentId = encodeURIComponent(componentId);
  return request.post(`/cache-registry-test/?qcomponent=${encodedComponentId}${suffix}`, {
    headers: {
      'content-type': 'application/json',
      'X-QCOMPONENT': componentId,
      'x-cache-run-id': props.runId,
      ...headers,
    },
    data: {
      props,
    },
  });
};

const getProductCardComponentId = async (request: APIRequestContext) => {
  const response = await postProductCard(
    request,
    createProps('registry-id'),
    {
      accept: 'application/json',
    },
    'qcomponent-format=json'
  );
  const payload = await response.json();
  return payload.component?.registry?.id ?? 'ProductCard';
};

const createProps = (label: string): ProductProps => ({
  productId: 'keyboard',
  runId: uniqueRunId(label),
});

const uniqueRunId = (label: string) => {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
