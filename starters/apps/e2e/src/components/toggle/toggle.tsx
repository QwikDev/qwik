/* eslint-disable */
import {
  component$,
  createContext,
  useServerMount$,
  useStore,
  Host,
  useClientMount$,
  useCleanup$,
  useContextProvider,
  useContext,
  mutable,
  useWatch$,
} from '@builder.io/qwik';

export const CTX = createContext<{ message: string; count: number }>('toggle');
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

  console.log('PARENT renders');
  return (
    <Host>
      {!store.cond ? <ToggleA root={store} /> : <ToggleB root={store} />}
      <Logs0 message={mutable(store.logs)} />
      <button type="button" id="toggle" onClick$={() => (store.cond = !store.cond)}>
        Toggle
      </button>
    </Host>
  );
});

export const Logs0 = component$((props: Record<string, any>) => {
  return (
    <Host>
      <Logs1 message={mutable(props.message)} />
    </Host>
  );
});

export const Logs1 = component$((props: Record<string, any>) => {
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
    props.root.logs += 'ToggleA';
  });

  useServerMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    state.mount = 'mounted in server';
  });

  useWatch$((track) => {
    track(rootState, 'count');
    state.copyCount = rootState.count;
  });

  useClientMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    state.mount = 'mounted in client';
  });

  return (
    <Host>
      <h1>ToggleA</h1>
      <div id="mount">{state.mount}</div>
      <div id="root">
        {rootState.message} ({rootState.count}/{state.copyCount})
      </div>
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
    props.root.logs += 'ToggleB';
  });

  useWatch$((track) => {
    track(rootState, 'count');
    state.copyCount = rootState.count;
  });

  useServerMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    state.mount = 'mounted in server';
  });

  useClientMount$(() => {
    if (state.mount !== '') {
      throw new Error('already mounted');
    }
    state.mount = 'mounted in client';
  });

  return (
    <Host>
      <h1>ToggleB</h1>
      <div id="mount">{state.mount}</div>
      <div id="root">
        {rootState.message} ({rootState.count}/{state.copyCount})
      </div>
    </Host>
  );
});
