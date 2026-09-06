import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbContent,
  EbSyncThrower,
  resetFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <EbContent />
    <EbSyncThrower />
  </ErrorBoundary>
));
