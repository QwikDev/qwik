import { component$, isBrowser, useComputed$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

let changedCount = 0;

// Not serialized; `?changed` makes every response and its eTag differ.
export const useResumeLoader = routeLoader$(
  ({ url }) => ({ id: url.searchParams.has('changed') ? `v${++changedCount}` : 'same' }),
  {
    serializationStrategy: 'never',
    eTag: ({ url }) => (url.searchParams.has('changed') ? String(Math.random()) : 'same'),
  }
);

export default component$(() => {
  const data = useResumeLoader();
  const label = useComputed$(() => {
    if (isBrowser) {
      (window as any).__resumeComputeRuns = ((window as any).__resumeComputeRuns || 0) + 1;
    }
    return 'label:' + data.value.id;
  });
  return (
    <section>
      <p id="resume-label">{label.value}</p>
      <button
        id="resume-read"
        onClick$={() => {
          (window as any).__resumeRead = data.value.id;
        }}
      >
        read
      </button>
    </section>
  );
});
