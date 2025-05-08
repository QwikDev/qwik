### @qwik.dev/core/testing

```ts
//vite.config.mts
import { defineConfig } from 'vite';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { qwikRouter } from '@qwik.dev/router/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => {
  return {
    plugins: [qwikRouter(), qwikVite(), tsconfigPaths()],
    define: {
      'globalThis.qTest': true,
      'globalThis.qDev': true,
    },
  };
});
```

```jsx
// card.spec.tsx

import { createDOM } from '@qwik.dev/core/testing';
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
