import { component$, useWatch$, Signal, useSignal } from '@builder.io/qwik';

export const Signals = component$(() => {
  const count = useSignal(0);
  const doubleCount = useSignal(0);

  useWatch$(({track}) => {
    doubleCount.value = track(count);
  });

  return (
    <>
      <button onClick$={() => count.value++}>
        Increment
      </button>
      <Child count={doubleCount}/>
    </>
  );
});

interface ChildProps {
  count: Signal<number>
}

export const Child = component$<ChildProps>(({count}) => {

  return (
    <>
      <div>{count}</div>
    </>
  );
});
