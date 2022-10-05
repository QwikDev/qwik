/* eslint-disable */
import { component$, useServerMount$, useWatch$, useStore } from '@builder.io/qwik';

interface State {
  count: number;
  doubleCount: number;
  debounced: number;
  server: string;
}

export const Watch = component$(() => {
  const nav = useStore({
    path: '/',
  });
  const store = useStore<State>({
    count: 2,
    doubleCount: 0,
    debounced: 0,
    server: '',
  });

  useServerMount$(() => {
    store.server = 'comes from server';
  });

  // This watch should be treeshaken
  useWatch$(({ track }) => {
    const path = track(() => nav.path);
    console.log(path);
  });

  // Double count watch
  useWatch$(({ track }) => {
    const count = track(() => store.count);
    store.doubleCount = 2 * count;
  });

  // Debouncer watch
  useWatch$(({ track }) => {
    const doubleCount = track(store, 'doubleCount');
    const timer = setTimeout(() => {
      store.debounced = doubleCount;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  console.log('PARENT renders');
  return <WatchShell nav={nav} store={store} />;
});

export const WatchShell = component$(({ store }: { nav: any; store: State }) => {
  return (
    <div>
      <div id="server-content">{store.server}</div>
      <div id="parent">{store.count + 0}</div>
      <Child state={store} />
      <button id="add" onClick$={() => store.count++}>
        +
      </button>
    </div>
  );
});

export const Child = component$((props: { state: State }) => {
  console.log('CHILD renders');
  return (
    <div>
      <div id="child">
        {props.state.count} / {props.state.doubleCount}
      </div>
      <GrandChild state={props.state} />
    </div>
  );
});

export const GrandChild = component$((props: { state: State }) => {
  console.log('GrandChild renders');
  return <div id="debounced">Debounced: {props.state.debounced}</div>;
});
