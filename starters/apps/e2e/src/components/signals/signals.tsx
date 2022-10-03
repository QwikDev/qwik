import { component$, useStore } from '@builder.io/qwik';

export const Signals = component$(() => {
  const store = useStore({
    foo: 10,
  });

  return (
    <div>
      <button onClick$={() => store.foo++}>Increment</button>
      <Child text="Message" count={store.foo} />
    </div>
  );
});

interface ChildProps {
  count: number;
  text: string;
}
export const Child = component$((props: ChildProps) => {
  return (
    <>
      <div>{props.text}</div>
      <div>Stuff: {props.count}</div>
      {Array.from({ length: 20000 }).map(() => {
        return <div aria-hidden="true">Expensive</div>;
      })}
    </>
  );
});
