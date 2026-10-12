import { Catch, component$, useComputed$, useSignal, Pending } from '@qwik.dev/core';
import { defaultFallback } from '../../../../error-handling/src/components/catch/catch';

export default component$(() => {
  const failed = useSignal(false);
  const value = useComputed$(async () => {
    if (failed.value) {
      throw new Error('client render failed');
    }
    return 'ready';
  });
  return (
    <>
      <button id="catch-fail" onClick$={() => (failed.value = true)}>
        Fail render
      </button>
      <Catch fallback$={defaultFallback}>
        <Pending fallback$={() => <p id="catch-pending">loading</p>}>
          <p id="catch-content">{value.value}</p>
        </Pending>
      </Catch>
    </>
  );
});
