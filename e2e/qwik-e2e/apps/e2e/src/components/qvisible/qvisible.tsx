import { component$, useSignal } from '@qwik.dev/core';

export const QVisibleRoot = component$(() => {
  const showClientSentinel = useSignal(false);
  const log = useSignal('');
  return (
    <div>
      <p id="log" style={{ position: 'fixed', top: 0, right: 0 }}>
        {log.value}
      </p>
      <button id="show" onClick$={() => (showClientSentinel.value = true)}>
        Show client sentinel
      </button>
      {showClientSentinel.value && (
        <div
          id="csr-sentinel"
          style={{ marginTop: '2000px' }}
          onQVisible$={() => (log.value += 'csr-visible;')}
        >
          client-rendered sentinel
        </div>
      )}
      <div
        id="ssr-sentinel"
        style={{ marginTop: '2000px' }}
        onQVisible$={() => (log.value += 'ssr-visible;')}
      >
        server-rendered sentinel
      </div>
    </div>
  );
});
