import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const input = useSignal(1);
  const a = useSignal(0);
  const b = useSignal(0);
  const out = useSignal(0);

  useVisibleTask$(({ track }) => {
    a.value = track(input) * 2;
  });
  useVisibleTask$(({ track }) => {
    b.value = track(a) * 2;
  });
  useVisibleTask$(({ track }) => {
    out.value = track(b) * 2;
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
