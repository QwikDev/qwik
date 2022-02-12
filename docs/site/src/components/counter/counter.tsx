import { onRender$, component$, Host, createStore } from '@builder.io/qwik';

export const Counter = component$(async () => {
  const state = createStore({ count: 0 });
  return onRender$(() => (
    <Host>
      <button class="bg-slate-200 p-10 text-zinc-900" on$:click={() => state.count++}>
        {state.count}
      </button>
    </Host>
  ));
});
