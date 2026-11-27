import { component$, isBrowser, useComputed$, useSignal } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

let version = 0;

export const useAutoLoader = routeLoader$(({ url }) => ({
  label: `version-${++version}`,
  padding: url.searchParams.has('large') ? 'auto-large-result'.repeat(1000) : '',
  shared: url.searchParams.has('shared'),
}));

export default component$(() => {
  const loader = useAutoLoader();
  const selected = useSignal(loader.value.shared ? loader.value : undefined);
  const label = useComputed$(() => {
    if (isBrowser) {
      (window as any).__autoComputations = ((window as any).__autoComputations || 0) + 1;
    }
    return loader.value.label;
  });

  return (
    <section>
      <p id="auto-label">{label.value}</p>
      <button id="auto-read" onClick$={() => ((window as any).__autoRead = loader.value.label)}>
        Read loader
      </button>
      <button
        id="auto-selected"
        onClick$={() => ((window as any).__autoSelected = selected.value?.label)}
      >
        Read selection
      </button>
      <button
        id="auto-refresh"
        onClick$={async () => {
          loader.invalidate(true);
          await loader.promise();
          (window as any).__autoRefreshed = loader.value.label;
        }}
      >
        Refresh loader
      </button>
    </section>
  );
});
