import { component$, useWatch$, Signal, useSignal } from '@builder.io/qwik';

export const Signals = component$(() => {
  const count = useSignal(0);
  const doubleCount = useSignal(0);
  const active = useSignal('active');

  useWatch$(({ track }) => {
    console.log('run: watch parent');
    doubleCount.value = track(count) * 2;
    active.value = count.value % 2 == 0 ? 'yes' : 'no';
  });

  console.log('run: render parent');

  return (
    <div data-active={active}>
      <button onClick$={() => count.value++}>Increment</button>
      <Child count={doubleCount} />
    </div>
  );
});

interface ChildProps {
  count: Signal<number>;
}

export const Child = component$<ChildProps>(({ count }) => {
  console.log('run: render child');

  return (
    <>
      <div>{count}</div>
      {Array.from({ length: 20000 }).map(() => {
        return <div aria-hidden="true">Expensive</div>;
      })}
    </>
  );
});
