/* eslint-disable */
import {
  component$,
  useServerMount$,
  useWatch$,
  useStore,
  useSignal,
  Signal,
  createContext,
  useContext,
  useContextProvider,
} from '@builder.io/qwik';

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
      <Issue1766Root />
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

export const LinkPath = createContext<{value: string}>('link-path');

export const Issue1766Root = component$(() => {
  const loc = useStore({
    value: '/root'
  });

  const final = useStore({
    value: '/root'
  });
  useContextProvider(LinkPath, loc);

  useWatch$(({track}) => {
    const path = track(() => loc.value);
    final.value = path.toUpperCase();
  });

  return (
    <>
      <Issue1766/>
      <div>Loc: {final.value}</div>
    </>
  )
});

export const Issue1766 = component$(() => {
  const counter = useSignal(0);
  useWatch$(async ({ track }) => {
    track(counter);

    console.log('This should show in the console over and over.');
  });
  return (
    <div>
      <h1>Should this work?</h1>

      <p>Check the browser console</p>

      <Issue1766Child counter={counter} />
    </div>
  );
});

type Props = {
  counter: Signal<number>;
};

export const Issue1766Child = component$<Props>(({ counter }) => {
  const state = useStore({ show: false });
  return (
    <>
      {state.show ? (
        <>

          <button
            onClick$={() => {
              counter.value++;
            }}
          >
            Bump In Child Component (Doesn't work)
          </button>
          <Link href='/page'/>
      </>) : (
        <button
          onClick$={() => {
            state.show = true;
          }}
        >
          Show Button
        </button>
      )}
    </>
  );
});

export const Link = component$((props: {href: string}) => {
  const loc = useContext(LinkPath);
  return (
    <button onClick$={() => {
      loc.value = props.href;
    }}>Navigate</button>
  )
});