import { component$, useResume$, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({
    resumed: false,
    resumedCount: null as number | null,
    count: 0,
  });
  useResume$(() => {
    store.resumed = true;
    store.resumedCount = store.count;
  });
  return (
    <>
      Resumed: {String(store.resumed)} at {store.resumedCount}
      <br />
      Count: {store.count}
      <br />
      <button onClick$={() => store.count++}>+1</button>
    </>
  );
});
