import { jsx } from '@qwik.dev/core';

export function App() {
  const badge = jsx('span', { children: 'value' });
  return <div class="host">{badge}</div>;
}
