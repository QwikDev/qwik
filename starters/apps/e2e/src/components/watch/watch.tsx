/* eslint-disable */
import { $, component$, useStore, useWatch$ } from '@builder.io/qwik';

interface State {
  count: number;
  doubleCount: number;
  debounced: number;
}

export const Watch = component$(() => {
  const store = useStore<State>({
    count: 1,
    doubleCount: 0,
    debounced: 0,
  });

  // Double count watch
  useWatch$((obs) => {
    console.log('here');
    const { count } = obs(store);
    store.doubleCount = 2 * count;
  });
  // doubleCount === 0

  // Debouncer watch
  useWatch$((obs) => {
    console.log('here');
    const { doubleCount } = obs(store);
    const timer = setTimeout(() => {
      store.debounced = doubleCount;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  console.log('PARENT renders');
  return (
    <div>
      <div>
        {store.count} / {store.doubleCount}
      </div>
      <Child state={store} />
      <button onClick$={() => store.count++}>+</button>
    </div>
  );
});

export const Child = component$((props: { state: State }) => {
  console.log('CHILD renders');
  return (
    <div>
      <div>
        {props.state.count} / {props.state.doubleCount}
      </div>
      <div>Debounced: {props.state.debounced}</div>
    </div>
  );
});
