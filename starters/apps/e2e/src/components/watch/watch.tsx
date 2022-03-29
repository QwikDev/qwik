import { $, component$, useStore, useWatch$ } from '@builder.io/qwik';

export const Watch = component$(() => {
  const store = useStore({ count: 0, doubleCount: 0, debounced: 0 });

  useWatch$((obs) => {
    store.doubleCount = 2 * obs(store).count;
  });

  useWatch$((obs) => {
    const { doubleCount } = obs(store);
    const timer = setTimeout(() => {
      store.debounced = doubleCount;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  return $(() => (
    <div>
      <div>
        {store.count} / {store.doubleCount}
      </div>
      <div>Debounced: {store.debounced}</div>
      <button onClick$={() => store.count++}>+</button>
    </div>
  ));
});
