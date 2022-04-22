/* eslint-disable */
import {
  $,
  component$,
  useWatchEffect$,
  useStore,
  useSubscriber,
  useWatch$,
} from '@builder.io/qwik';

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
    const { count } = obs(store);
    store.doubleCount = 2 * count;
  });

  useWatch$((observe) => {
    const { count } = observe(store);
    store.doubleCount = 2 * count;
  });

  useWatch$(() => {
    const { count } = useSubscriber(store);
    store.doubleCount = 2 * count;
  });

  useWatch$(() => {
    store.doubleCount = 2 * store.count;
  });

  useWatch$(() => {
    store.count++; // infinite loop
  });

  useWatchEffect$(() => {
    store.doubleCount = 2 * store.count;
  });

  useWatchEffect$(() => {
    store.doubleCount = 2 * store.count;
  });

  // Debouncer watch
  useWatch$((obs) => {
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
