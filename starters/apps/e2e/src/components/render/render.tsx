import { component$, useStore } from '@builder.io/qwik';

export const Render = component$(() => {
  const parent = {
    counter: {
      count: 0,
    },
    children: [] as any[],
  };
  parent.children.push(parent);

  const state = useStore(parent, { recursive: true });
  return (
    <button
      onClick$={() => {
        state.counter.count++;
      }}
    >
      <Child counter={state.counter}></Child>
    </button>
  );
});

export const Child = component$((props: { counter: { count: number } }) => {
  return <>Rerender {props.counter.count}</>;
});
