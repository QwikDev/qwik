import { onRender, qComponent, useState } from '@builder.io/qwik';

export const Counter = qComponent('counter', () => {
  const state = useState({ count: 0 });
  return onRender(() => (
    <>
      <span>{state.count}</span>
      <PlusOne counter={state}></PlusOne>
    </>
  ));
});

export const PlusOne = qComponent('plus-one', (props: { counter: { count: number } }) => {
  return onRender(() => <button on:click={() => props.counter.count++}>+1</button>);
});
