import { component$, useSignal } from '@builder.io/qwik';

export const Signals = component$(() => {
  console.log('parent');
  const count = useSignal(0);

  return (
    <div>
      <button onClick$={() => count.value++}>Increment</button>
      <Child text="sdfkjhsadfkjhsdf" count={count.value} />
    </div>
  );
});

interface ChildProps {
  count: number;
  text: string;
}
export const Child = component$((props: ChildProps) => {
  debugger;
  console.log('child', props.count);

  return (
    <>
      <div>{props.text}</div>
      <div>{props.count}</div>
      {Array.from({ length: 20000 }).map(() => {
        return <div aria-hidden="true">Expensive</div>;
      })}
    </>
  );
});
