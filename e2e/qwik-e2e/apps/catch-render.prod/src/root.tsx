import { Catch, component$, useServerData, useSignal } from '@qwik.dev/core';
import Root from '../../error-handling/src/root';

const DocumentFallback = component$(() => {
  const count = useSignal(0);
  return (
    <button id="document-caught" onClick$={() => count.value++}>
      {count.value}
    </button>
  );
});

export default component$(() => {
  const url = new URL(useServerData('url', 'http://localhost/'));
  return url.searchParams.has('documentCatch') ? (
    <Catch fallback$={() => <DocumentFallback />}>
      <Root />
    </Catch>
  ) : (
    <Root />
  );
});
