import { component$, useContextProvider, useSignal } from '@qwik.dev/core';
import { GlobalCountCtx } from '~/components/reactify/badge';
import { QReactApp } from '~/components/reactify';

export default component$(() => {
  const globalCount = useSignal(0);
  useContextProvider(GlobalCountCtx, globalCount);

  return (
    <div>
      <div data-testid="qwik-controls">
        <span data-testid="global-count">global count {globalCount.value}</span>
        <button data-testid="global-inc" onClick$={() => globalCount.value++}>
          global inc
        </button>
      </div>
      <QReactApp />
    </div>
  );
});
