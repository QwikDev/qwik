import { component$, useStore, Host } from '@builder.io/qwik';

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
    <Host>
      <button
        onClick$={() => {
          state.counter.count++;
        }}
      >
        <Child counter={state.counter}></Child>
      </button>
    </Host>
  );
});

export const Child = component$((props: { counter: { count: number } }) => {
  return <Host>Rerender {props.counter.count}</Host>;
});
