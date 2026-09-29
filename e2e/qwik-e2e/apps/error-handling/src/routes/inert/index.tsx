import { component$, Catch, isServer, useSignal, useTask$, type Signal } from '@qwik.dev/core';
import { defaultFallback, CatchSyncThrower } from '../../components/catch/catch';

const CatchInertContent = component$<{ trigger: Signal<number> }>((props) => {
  useTask$(({ track }) => {
    track(() => props.trigger.value);
    if (!isServer) {
      (window as any).__catchDeadTaskClientRuns =
        ((window as any).__catchDeadTaskClientRuns ?? 0) + 1;
    }
  });
  return (
    <div id="catch-content">
      <p>streamed content</p>
      <CatchSyncThrower />
    </div>
  );
});

export default component$(() => {
  const inertTrigger = useSignal(0);
  return (
    <>
      <Catch fallback$={defaultFallback}>
        <CatchInertContent trigger={inertTrigger} />
      </Catch>
      <button id="catch-inert-trigger" onClick$={() => inertTrigger.value++}>
        bump signal
      </button>
      <span id="catch-inert-val">{inertTrigger.value}</span>
    </>
  );
});
