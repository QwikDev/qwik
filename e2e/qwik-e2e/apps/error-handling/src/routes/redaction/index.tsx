import { component$, ErrorBoundary } from '@qwik.dev/core';
import { defaultFallback, EbSyncThrower } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbSyncThrower message="redaction secret boom" />
  </ErrorBoundary>
));
