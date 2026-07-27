import { component$, ErrorBoundary } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { defaultFallback, EbSyncThrower } from '../../components/error-boundary/error-boundary';

// Distinct secret so a prod test can prove the raw message never reaches the page.
export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbSyncThrower message="redaction secret boom" />
  </ErrorBoundary>
));
