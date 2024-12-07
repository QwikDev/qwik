/* eslint-disable */
import {
  component$,
  useTask$,
  useStore,
  useSignal,
  type Signal,
  createContextId,
  useContext,
  useContextProvider,
  $,
} from "@builder.io/qwik";
import { isServer } from "@builder.io/qwik";

interface State {
  count: number;
  doubleCount: number;
  debounced: number;
  server: string;
}

export const Watch = component$(() => {
  const nav = useStore({
    path: "/",
  });
  const store = useStore<State>({
    count: 2,
    doubleCount: 0,
    debounced: 0,
    server: "",
  });

  useTask$(() => {
    if (isServer) {
      store.server = "comes from server";
    }
  });

  // This watch should be treeshaken
  useTask$(({ track }) => {
    const path = track(() => nav.path);
    console.log(path);
  });

  // Double count watch
  useTask$(({ track }) => {
    const count = track(() => store.count);
    store.doubleCount = 2 * count;
  });

  // Debouncer watch
  useTask$(({ track }) => {
    const doubleCount = track(() => store.doubleCount);
    const timer = setTimeout(() => {
      store.debounced = doubleCount;
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  });

  console.log("PARENT renders");
  return <WatchShell nav={nav} store={store} />;
});

export const WatchShell = component$(
  ({ store }: { nav: any; store: State }) => {
    return (
      <div>
        <div id="server-content">{store.server}</div>
        <div id="parent">{store.count + 0}</div>
        <Child state={store} />
        <button id="add" onClick$={() => store.count++}>
          +
        </button>
        <Issue1766Root />
        <Issue2972 />
      </div>
    );
  },
);

export const Child = component$<{ state: State }>((props) => {
  console.log("CHILD renders");
  return (
    <div>
      <div id="child">
        {props.state.count} / {props.state.doubleCount}
      </div>
      <GrandChild state={props.state} />
    </div>
  );
});

export const GrandChild = component$<{ state: State }>((props) => {
  console.log("GrandChild renders");
  return <div id="debounced">Debounced: {props.state.debounced}</div>;
});

export const LinkPath = createContextId<{ value: string }>("link-path");

export const Issue1766Root = component$(() => {
  const loc = useStore({
    value: "/root",
  });

  const final = useStore({
    value: "/root",
  });
  useContextProvider(LinkPath, loc);

  useTask$(({ track }) => {
    const path = track(() => loc.value);
    final.value = path.toUpperCase();
  });

  return (
    <>
      <Issue1766 />
      <div id="issue-1766-loc">Loc: {final.value}</div>
    </>
  );
});

export const Issue1766 = component$(() => {
  const counter = useSignal(0);
  const second = useSignal("---");

  useTask$(async ({ track }) => {
    track(counter);
    if (counter.value !== 0) {
      second.value = "watch ran";
    }
  });

  return (
    <div>
      <p id="issue-1766">{second.value}</p>
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
            id="show-btn-2"
            onClick$={() => {
              counter.value++;
            }}
          >
            Bump In Child Component (Doesn't work)
          </button>
          <Link href="/page" />
        </>
      ) : (
        <button
          id="show-btn"
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

export const Link = component$((props: { href: string }) => {
  const loc = useContext(LinkPath);
  return (
    <button
      id="link-navigate"
      onClick$={() => {
        loc.value = props.href;
      }}
    >
      Navigate
    </button>
  );
});

export function foo(this: any) {
  return this.value;
}

export const Issue2972 = component$(() => {
  const message = useSignal("");
  useTask$(async () => {
    message.value = await $(foo).apply({ value: "passed" });
  });

  return (
    <>
      <div id="issue-2972">{message.value}</div>
    </>
  );
});
