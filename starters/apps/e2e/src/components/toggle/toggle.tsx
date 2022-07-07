/* eslint-disable */
import {
  component$,
  createContext,
  useStore,
  Host,
  useCleanup$,
  useContextProvider,
  useContext,
  useMount$,
  mutable,
  useWatch$,
} from '@builder.io/qwik';
import { isBrowser, isServer } from '@builder.io/qwik/build';

export const CTX = createContext<{ message: string; count: number }>('toggle');

export const CTX_LOCAL = createContext<{ logs: string }>('logs');

export const Toggle = component$(() => {
  const store = useStore({
    message: 'hello from root',
    count: 0,
  });
  useContextProvider(CTX, store);
  return (
    <Host>
      <button id="increment" type="button" onClick$={() => store.count++}>
        Root increment
      </button>
      <ToggleShell />
    </Host>
  );
});

export const ToggleShell = component$(() => {
  const store = useStore({
    cond: false,
    logs: '',
  });

  useContextProvider(CTX_LOCAL, store);

  console.log('PARENT renders');
  return (
    <Host>
      <Logs0 store={store} />
      {!store.cond ? <ToggleA root={store} /> : <ToggleB root={store} />}
      <button type="button" id="toggle" onClick$={() => (store.cond = !store.cond)}>
        Toggle
      </button>
    </Host>
  );
});

export const Logs0 = component$((props: Record<string, any>) => {
  const rootState = useContext(CTX);
  const logs = useContext(CTX_LOCAL);

  useWatch$((track) => {
    const count = track(rootState, 'count');
    console.log('changed');
    logs.logs += `Log(${count})`;
  });
  console.log('created');

  return (
    <Host>
      <Logs1 store={props.store} />
    </Host>
  );
});

export const Logs1 = component$((props: Record<string, any>) => {
  return (
    <Host>
      <Logs2 message={mutable(props.store.logs)} />
    </Host>
  );
});

export const Logs2 = component$((props: Record<string, any>) => {
  return <Host id="logs">Logs: {props.message}</Host>;
});

export const ToggleA = component$((props: { root: { logs: string } }) => {
  console.log('ToggleA renders');
  const rootState = useContext(CTX);

  const state = useStore({
    mount: '',
    copyCount: 0,
  });

  useCleanup$(() => {
    props.root.logs += 'ToggleA()';
  });

  useMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    if (isServer) {
      state.mount = 'mounted in server';
    }
    if (isBrowser) {
      state.mount = 'mounted in client';
    }
  });

  useWatch$((track) => {
    track(rootState, 'count');
    state.copyCount = rootState.count;
  });

  return (
    <Host>
      <h1>ToggleA</h1>
      <div id="mount">{state.mount}</div>
      <div id="root">
        {rootState.message} ({rootState.count}/{state.copyCount})
      </div>
      <Child />
    </Host>
  );
});

export const ToggleB = component$((props: { root: { logs: string } }) => {
  console.log('ToggleB renders');
  const rootState = useContext(CTX);

  const state = useStore({
    mount: '',
    copyCount: 0,
  });

  useCleanup$(() => {
    props.root.logs += 'ToggleB()';
  });

  useWatch$((track) => {
    track(rootState, 'count');
    state.copyCount = rootState.count;
  });

  useMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    if (isServer) {
      state.mount = 'mounted in server';
    }
    if (isBrowser) {
      state.mount = 'mounted in client';
    }
    return 32;
  });

  return (
    <Host>
      <h1>ToggleB</h1>
      <div id="mount">{state.mount}</div>
      <div id="root">
        {rootState.message} ({rootState.count}/{state.copyCount})
      </div>
      <Child />
    </Host>
  );
});

export const Child = component$(() => {
  const rootState = useContext(CTX);
  const logs = useContext(CTX_LOCAL);

  useWatch$((track) => {
    const count = track(rootState, 'count');
    console.log('Child', count);
    logs.logs += `Child(${count})`;
  });

  return <div>CHILD</div>;
});
