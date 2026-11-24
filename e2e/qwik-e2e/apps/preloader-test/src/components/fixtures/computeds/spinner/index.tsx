import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { ReportButton } from './report-button';
import { Worker } from './worker';

export default component$(() => {
  const loading = useSignal(false);
  const request = useSignal(0);
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  return (
    <section class="fixture" data-fixture="computeds/spinner">
      <h2>a click that shows a spinner</h2>
      <button
        data-testid="trigger"
        onClick$={() => {
          loading.value = true;
          request.value++;
        }}
      >
        Start
      </button>
      <ReportButton report={{ id: 1, total }} loading={loading} request={request} />
      <span data-testid="spinner">{loading.value ? 'loading' : 'idle'}</span>
      <Worker request={request} loading={loading} />
    </section>
  );
});
