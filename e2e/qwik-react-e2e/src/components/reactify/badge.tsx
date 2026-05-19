import { component$, createContextId, useContext, useSignal, type Signal } from '@qwik.dev/core';

/** Shared context holding a global count signal */
export const GlobalCountCtx = createContextId<Signal<number>>('global-count');

/** A Qwik component to be rendered inside React via reactify$ */
export const QwikBadge = component$<{ label: string }>((props) => {
  console.warn('rendering QwikBadge with label', props.label);
  const clicks = useSignal(0);
  const globalCount = useContext(GlobalCountCtx);
  return (
    <span data-testid="qwik-badge">
      <span data-testid="badge-label">{props.label}</span>
      <button data-testid="badge-btn" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <span data-testid="badge-global">global={globalCount.value}</span>
      <button data-testid="badge-global-inc" onClick$={() => globalCount.value++}>
        g+
      </button>
    </span>
  );
});
