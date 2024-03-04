import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ counter: { count: 0 }, list: [0] }, { deep: false });

  return (
    <>
      <Display counter={store.counter} list={store.list} />
      <button onClick$={() => (store.counter = { count: ++store.counter.count })}>+1 Count</button>
      <button onClick$={() => (store.list = [...store.list, 0])}>+1 List element</button>
    </>
  );
});

interface DisplayProps {
  counter: { count: number };
  list: number[];
}
export const Display = component$((props: DisplayProps) => {
  return (
    <p>
      Count: {props.counter.count}, List length: {props.list.length}
    </p>
  );
});
