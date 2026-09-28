import { component$, Catch, useComputed$, useSignal } from '@qwik.dev/core';
import { defaultFallback } from '../../components/catch/catch';

const AsyncErrorInline = component$(() => {
  const fail = useSignal(false);
  const data = useComputed$(async () => {
    if (fail.value) {
      throw new Error('expected-async-error');
    }
    return 'first';
  });
  return (
    <div>
      <button id="async-refresh" onClick$={() => (fail.value = true)}>
        refresh
      </button>
      <div id="async-value">{data.value}</div>
      <div id="async-error">handled: {data.error?.message ?? 'none'}</div>
    </div>
  );
});

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <AsyncErrorInline />
  </Catch>
));
