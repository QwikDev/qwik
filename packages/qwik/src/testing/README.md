### @builder.io/qwik/testing

```jsx
// card.test.tsx

import { createDOM } from '@builder.io/qwik/testing';
import { test, expect } from 'vitest';
import Card from './card.tsx';

test(`[Card Component]: Only render`, async () => {
  const { screen, render } = createDOM();
  await render(<Card />);
  expect(screen.outerHTML).toCointain('Counter_0');
});

test(`[Card Component]: Click counter +1`, async () => {
  const { screen, render, userEvent } = createDOM();
  await render(<Card />);
  expect(screen.outerHTML).toCointain('Counter_0');
  await userEvent('button.btn-counter', 'click');
  expect(screen.outerHTML).toCointain('Counter_1');
});
```
