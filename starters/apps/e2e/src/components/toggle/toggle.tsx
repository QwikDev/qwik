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
} from '@builder.io/qwik';

export const CTX = createContext<{ message: string }>('toggle');
export const Toggle = component$(() => {
  const store = useStore({
    message: 'hello from root',
  });
  useContextProvider(CTX, store);
  return (
    <Host>
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
      <div id="logs">Logs: {store.logs}</div>
      <button type="button" onClick$={() => (store.cond = !store.cond)}>
        Toggle
      </button>
    </Host>
  );
});

export const ToggleA = component$((props: { root: { logs: string } }) => {
  console.log('ToggleA renders');
  const rootState = useContext(CTX);

  const state = useStore({
    mount: '',
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
      <div id="root">{rootState.message}</div>
    </Host>
  );
});

export const ToggleB = component$((props: { root: { logs: string } }) => {
  console.log('ToggleB renders');
  const rootState = useContext(CTX);

  const state = useStore({
    mount: '',
  });

  useCleanup$(() => {
    props.root.logs += 'ToggleB';
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
      <div id="root">{rootState.message}</div>
    </Host>
  );
});
