import { component$, Catch, useComputed$ } from '@qwik.dev/core';
import type { _ComputedSignalInternal } from '@qwik.dev/core/internal';
import { defaultFallback } from '../../components/catch/catch';

const AsyncErrorInline = component$(() => {
  const data = useComputed$(async () => {
    throw new Error('expected-async-error');
  }) as _ComputedSignalInternal<never>;
  if (data.pending) {
    return <span id="async-loading">loading</span>;
  }
  return <div id="async-error">handled: {(data.error as Error)?.message ?? 'none'}</div>;
});

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <AsyncErrorInline />
  </Catch>
));
