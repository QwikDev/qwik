import { component$, useStore, Host } from '@builder.io/qwik';

export const Render = component$(() => {
  const state = useStore(
    {
      counter: {
        count: 0,
      },
    },
    { recursive: true }
  );
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
