import { jsx } from '@qwik.dev/core';

export function Badge(props: { label: string }) {
  return <span class="badge">{props.label}</span>;
}

export function App() {
  return jsx(Badge, { label: 'clicks' });
}
