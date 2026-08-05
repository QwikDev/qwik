import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { ping } from '~/shared/visible-task-server-fn';

export default component$(() => {
  const result = useSignal('pending');

  useVisibleTask$(async () => {
    result.value = await ping();
  });

  return <div id="visible-task-alias-server-fn">{result.value}</div>;
});
