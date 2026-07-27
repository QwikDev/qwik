import {
  component$,
  ErrorBoundary,
  isServer,
  useSignal,
  useTask$,
  type Signal,
} from '@qwik.dev/core';
import { defaultFallback, EbSyncThrower } from '../../components/error-boundary/error-boundary';

// A task inside the swapped-out content must not re-run when an outside signal changes.
const EbInertContent = component$<{ trigger: Signal<number> }>((props) => {
  useTask$(({ track }) => {
    track(() => props.trigger.value);
    if (!isServer) {
      (window as any).__ebDeadTaskClientRuns = ((window as any).__ebDeadTaskClientRuns ?? 0) + 1;
    }
  });
  return (
    <div id="eb-content">
      <p>streamed content</p>
      <EbSyncThrower />
    </div>
  );
});

export default component$(() => {
  const inertTrigger = useSignal(0);
  return (
    <>
      <ErrorBoundary fallback$={defaultFallback}>
        <EbInertContent trigger={inertTrigger} />
      </ErrorBoundary>
      <button id="eb-inert-trigger" onClick$={() => inertTrigger.value++}>
        bump signal
      </button>
      <span id="eb-inert-val">{inertTrigger.value}</span>
    </>
  );
});
