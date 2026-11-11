import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const input = useSignal(1);
  const a = useSignal(0);
  const b = useSignal(0);
  const out = useSignal(0);

  useVisibleTask$(({ track }) => {
    const n = track(input);
    a.value = n && n + 1;
  });
  useVisibleTask$(({ track }) => {
    const n = track(a);
    b.value = n && n + 1;
  });
  useVisibleTask$(({ track }) => {
    const n = track(b);
    out.value = n && n + 1;
  });

  return (
    <section class="fixture" data-fixture="visible/above">
      <h2>visible task above the fold</h2>
      <output data-testid="result" data-done={out.value ? '' : undefined}>
        {out.value}
      </output>
    </section>
  );
});
