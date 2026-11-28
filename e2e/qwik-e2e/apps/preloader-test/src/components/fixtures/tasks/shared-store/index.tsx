import { component$, useContextProvider, useStore } from '@qwik.dev/core';
import { Reader } from './reader';
import { SharedStoreContext, type SharedStore } from './store';
import { TracksA } from './tracks-a';
import { TracksB } from './tracks-b';
import { Writer } from './writer';

export default component$(() => {
  const store = useStore<SharedStore>({ a: 0, b: 0 });
  useContextProvider(SharedStoreContext, store);
  return (
    <section class="fixture" data-fixture="tasks/shared-store">
      <h2>tasks on a shared store</h2>
      <Writer />
      <Reader />
      <TracksA />
      <TracksB />
    </section>
  );
});
