import { component$, ErrorBoundary, isServer } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// Distinct secret so a prod test can prove the raw message never reaches the page.
const EbSecretThrower = component$(() => {
  if (isServer) {
    throw new Error('redaction secret boom');
  }
  return <span id="eb-thrower-client" />;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbSecretThrower />
  </ErrorBoundary>
));
