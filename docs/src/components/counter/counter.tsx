import { component$, Host, useStore } from '@builder.io/qwik';

export const Counter = component$(() => {
  const state = useStore({ count: 0 });
  return (
    <Host>
      <button class="bg-slate-200 p-10 text-zinc-900" onClick$={() => state.count++}>
        {state.count}
      </button>
    </Host>
  );
});
