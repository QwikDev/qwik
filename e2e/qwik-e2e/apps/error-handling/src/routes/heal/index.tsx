import { component$, ErrorBoundary, isServer, type JSXOutput } from '@qwik.dev/core';
import { resetFallback } from '../../components/error-boundary/error-boundary';

// New route (no god-file antecedent): SSR throws so the fallback resumes; the
// client render heals on reset, so content replaces the fallback without re-erroring.
const EbHealOnce = component$((): JSXOutput => {
  if (isServer) {
    throw new Error('eb heal ssr boom');
  }
  return <p id="eb-heal-recovered">healed</p>;
});

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <EbHealOnce />
  </ErrorBoundary>
));
