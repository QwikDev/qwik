import {
  component$,
  ErrorBoundary,
  isServer,
  useSignal,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// New route (no god-file antecedent): a signal declared outside the boundary is wired
// into the resumed child; incrementing it after the SSR swap must still work.
const EbWireContent = component$<{ count: Signal<number> }>((props): JSXOutput => {
  if (isServer) {
    throw new Error('eb wire ssr boom');
  }
  return (
    <section id="eb-wire-recovered">
      <button id="eb-wire-button" onClick$={() => props.count.value++}>
        Wire bump
      </button>
      <span id="eb-wire-count">{props.count.value}</span>
    </section>
  );
});

export default component$(() => {
  const count = useSignal(0);
  return (
    <ErrorBoundary fallback$={defaultFallback}>
      <EbWireContent count={count} />
    </ErrorBoundary>
  );
});
