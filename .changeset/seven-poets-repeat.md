---
'@builder.io/qwik-city': patch
---

feat: allow mocking loaders in QwikCityMockProvider


> If you are using `routeLoader$`s in a Qwik Component that you want to test, you can provide a `loaders` prop to mock the data returned by the loaders

```ts title="src/loaders/product.loader.ts"
import { routeLoader$ } from '@builder.io/qwik-city';

export const useProductData = routeLoader$(async () => {
  const res = await fetch('https://.../product');
  const product = (await res.json()) as Product;
  return product;
});
```

```tsx title="src/components/product.tsx"
import { component$ } from '@builder.io/qwik';

import { useProductData } from '../loaders/product.loader';

export const Footer = component$(() => {
  const signal = useProductData();
  return <footer>Product name: {signal.value.product.name}</footer>;
});
```

```tsx title="src/components/product.spec.tsx"
import { createDOM } from '@builder.io/qwik/testing';
import { test, expect } from 'vitest';

import { Footer } from './product';
import { useProductData } from '../loaders/product.loader';

test('should render footer with product name', async () => {
  const { screen, render } = await createDOM();
  const loadersMock = [
    {
      loader: useProductData,
      data: { product: { name: 'Test Product' } },
    },
  ];
  await render(
    <QwikCityMockProvider loaders={loadersMock}>
      <Footer />
    </QwikCityMockProvider>,
  );
  expect(screen.innerHTML).toMatchSnapshot();
});
```