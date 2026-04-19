import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { worker$ } from '@qwik.dev/core/worker';

const serverWorker = worker$(() => {
  return 'hello from worker';
});

export default component$(() => {
  const result = useSignal('pending');

  useTask$(async () => {
    result.value = await serverWorker();
  });

  return (
    <>
      <h1>Worker page</h1>
      <div id="worker-server-result">{result.value}</div>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Worker page',
};
