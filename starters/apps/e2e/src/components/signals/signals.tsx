import { component$, useWatch$, Signal, useSignal, useStore } from '@builder.io/qwik';

export const Signals = component$(() => {
  const count = useSignal(0);
  const doubleCount = useSignal(0);

  useWatch$(({ track }) => {
    doubleCount.value = track(count) * 2;
  });

  console.log('render parent');

  return (
    <>
      <button onClick$={() => count.value++}>Increment</button>
      <Child count={doubleCount} />
    </>
  );
});

interface ChildProps {
  count: Signal<number>;
}

export const Child = component$<ChildProps>(({ count }) => {
  console.log('render child');

  return (
    <>
      <div>{count}</div>
      {Array.from({ length: 100 }).map(() => {
        return <div aria-hidden="true">Expensive</div>;
      })}
    </>
  );
});
