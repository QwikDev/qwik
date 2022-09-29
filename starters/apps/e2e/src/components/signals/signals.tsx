import { component$, useStore } from '@builder.io/qwik';

export const Signals = component$(() => {
  const store = useStore({
    count: 0,
  });

  console.log('render parent');
  return (
    <div>
      <button onClick$={() => store.count++}>Increment</button>
      <Child text="Message" count={store.count} />
    </div>
  );
});

interface ChildProps {
  count: number;
  text: string;
}
export const Child = component$((props: ChildProps) => {
  console.log('render child');

  return (
    <>
      <div>{props.text}</div>
      <div>Stuff: {props.count}</div>
    </>
  );
});
