### @builder.io/qwik/testing

```ts
//vite.config.ts
import { defineConfig } from 'vite';
import { qwikVite } from '@builder.io/qwik/optimizer';
import { qwikCity } from '@builder.io/qwik-city/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => {
  return {
    plugins: [qwikCity(), qwikVite(), tsconfigPaths()],
    define: {
      'globalThis.qTest': true,
      'globalThis.qDev': true,
    },
  };
});
```

```jsx
// card.test.tsx

import { createDOM } from '@builder.io/qwik/testing';
import { test, expect } from 'vitest';
import Card from './card.tsx';

test(`[Card Component]: 🙌 Only render`, async () => {
  const { screen, render } = await await createDOM();
  await render(<Card />);
  expect(screen.outerHTML).toContain('Counter_0');
});

test(`[Card Component]: 🙌 Click counter +1 `, async () => {
  const { screen, render, userEvent } = await await createDOM();
  await render(<Card />);
  expect(screen.outerHTML).toContain('Counter_0');
  await userEvent('button.btn-counter', 'click');
  expect(screen.outerHTML).toContain('Counter_1');
});
```
