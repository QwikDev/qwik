import { component$, Catch, Pending, useComputed$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/catch/catch';

const AsyncValueThrows = component$(() => {
  const data = useComputed$(async () => {
    throw new Error('unexpected-async-error');
  });
  return <div id="async-value">{String(data.value)}</div>;
});

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <Pending fallback$={() => <span id="async-loading">loading</span>}>
      <AsyncValueThrows />
    </Pending>
  </Catch>
));
