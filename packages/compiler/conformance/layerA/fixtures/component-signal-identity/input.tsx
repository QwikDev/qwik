import { useSignal, useTask$, type Signal } from '@qwik.dev/core';

export function Child({ value, final }: { value: Signal<string>; final: string }) {
  useTask$(() => {
    value.value = final;
  });
  return <p>child</p>;
}

export function App() {
  const value = useSignal('initial');
  return (
    <div>
      <span title={value.value}>ready</span>
      <Child value={value} final="final" />
    </div>
  );
}
