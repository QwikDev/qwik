import { component$, useStore } from '@builder.io/qwik';

export const Signals = component$(() => {
  const store = useStore({
    foo: 10,
    attribute: 'even',
  });
  console.warn('render parent');

  return (
    <div aria-label={store.attribute}>
      <button
        onClick$={() => {
          store.foo++;
          store.attribute = store.foo % 2 === 0 ? 'even' : 'odd';
        }}
      >
        Increment
      </button>
      <Child text="Message" count={store.foo} />
    </div>
  );
});

interface ChildProps {
  count: number;
  text: string;
}
export const Child = component$((props: ChildProps) => {
  console.warn('render child');
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
