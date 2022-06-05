/* eslint-disable */
import { component$, useServerMount$, useWatch$, useStore, Host } from '@builder.io/qwik';

interface State {
  count: number;
  doubleCount: number;
  debounced: number;

  server: string;
}

export const Watch = component$(() => {
  const store = useStore<State>({
    count: 2,
    doubleCount: 0,
    debounced: 0,
    server: '',
  });

  useServerMount$(() => {
    store.server = 'comes from server';
  });

  // Double count watch
  useWatch$((track) => {
    const count = track(store, 'count');
    store.doubleCount = 2 * count;
  });

  // Debouncer watch
  useWatch$((track) => {
    const doubleCount = track(store, 'doubleCount');
    const timer = setTimeout(() => {
      store.debounced = doubleCount;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  console.log('PARENT renders');
  return <WatchShell store={store} />;
});

export const WatchShell = component$(({ store }: { store: State }) => {
  return (
    <Host>
      <div id="server-content">{store.server}</div>
      <div id="parent">{store.count}</div>
      <Child state={store} />
      <button id="add" onClick$={() => store.count++}>
        +
      </button>
    </Host>
  );
});

export const Child = component$((props: { state: State }) => {
  console.log('CHILD renders');
  return (
    <Host>
      <div id="child">
        {props.state.count} / {props.state.doubleCount}
      </div>
      <GrandChild state={props.state} />
    </Host>
  );
});

export const GrandChild = component$((props: { state: State }) => {
  console.log('GrandChild renders');
  return <div id="debounced">Debounced: {props.state.debounced}</div>;
});
