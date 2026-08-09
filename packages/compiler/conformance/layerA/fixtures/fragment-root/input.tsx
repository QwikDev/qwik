import { component$, useSignal } from '@qwik.dev/core';

// a fragment-rooted body has no element to anchor a dynamic child on
const Child = component$((props: { counter: { count: number } }) => {
  return <>Rerender {props.counter.count}</>;
});

export function App() {
  const counter = useSignal({ count: 2 });
  return (
    <main>
      <Child counter={counter.value} />
    </main>
  );
}
