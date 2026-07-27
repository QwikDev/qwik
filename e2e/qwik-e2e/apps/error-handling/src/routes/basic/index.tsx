import { component$, ErrorBoundary } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import {
  defaultFallback,
  EbContent,
  EbSyncThrower,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbContent />
    <EbSyncThrower />
  </ErrorBoundary>
));
