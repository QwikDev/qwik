import { component$, useStore, useWaitOn, NoSerialize, noSerialize } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({
    count: 0,
    delay: undefined as NoSerialize<Promise<void>>,
  });

  useWaitOn(store.delay);

  console.log('render');
  return (
    <>
      Count: {store.count}
      <br />
      <button
        onClick$={() => {
          store.count++;
          store.delay = noSerialize(delay(1000));
        }}
      >
        +1
      </button>
    </>
  );
});

export const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
