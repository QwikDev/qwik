import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export default component$(() => {
  const input = useSignal(1);
  const a = useSignal(0);
  const b = useSignal(0);
  const out = useSignal(0);

  useVisibleTask$(
    ({ track }) => {
      a.value = track(input) * 2;
    },
    { strategy: 'document-ready' }
  );
  useVisibleTask$(
    ({ track }) => {
      b.value = track(a) * 2;
    },
    { strategy: 'document-ready' }
  );
  useVisibleTask$(
    ({ track }) => {
      out.value = track(b) * 2;
    },
    { strategy: 'document-ready' }
  );

  return (
    <section class="fixture" data-fixture="visible/document-ready">
      <h2>visible task, document-ready, below the fold</h2>
      <output data-testid="result" data-done={out.value ? '' : undefined}>
        {out.value}
      </output>
    </section>
  );
});
