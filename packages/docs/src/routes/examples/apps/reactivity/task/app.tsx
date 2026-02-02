import { component$, useTask$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  const debounced = useSignal(0);

  useTask$(({ track }) => {
    // track changes in count
    const value = track(count);
    console.log('count changed');

    const timer = setTimeout(() => {
      debounced.value = value;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  console.log('<App> renders');
  return (
    <div>
      <Child count={count.value} debounced={debounced.value} />
      <button id="add" onClick$={() => count.value++}>
        +
      </button>
    </div>
  );
});

export const Child = component$((props: { count: number; debounced: number }) => {
  console.log('<Child> render');
  return (
    <div>
      <div id="child">{props.count}</div>
      <GrandChild debounced={props.debounced} />
    </div>
  );
});

export const GrandChild = component$((props: { debounced: number }) => {
  console.log('<GrandChild> render');
  return <div id="debounced">Debounced: {props.debounced}</div>;
});
