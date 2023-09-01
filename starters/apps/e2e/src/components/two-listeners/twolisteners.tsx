import { $, component$, useStore } from "@builder.io/qwik";

export const TwoListeners = component$(() => {
  const store1 = useStore({ count: 1 });
  const store2 = useStore({ count: 1 });

  const update = $(() => store2.count++);
  return (
    <a
      href="/"
      preventdefault:click
      class="two-listeners"
      onClick$={[$(() => store1.count++), update, undefined, [null, update]]}
    >
      {store1.count} / {store2.count}
    </a>
  );
});
