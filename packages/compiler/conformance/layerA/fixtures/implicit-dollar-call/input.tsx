import { useSignal } from '@qwik.dev/core';
import { transform$ } from './api';

function Child(props: { implicit: unknown }) {
  return <p>{typeof props.implicit}</p>;
}

export function App() {
  const count = useSignal(1);
  return <Child implicit={transform$(() => count.value)} />;
}
