import { component$, ErrorBoundary } from '@qwik.dev/core';
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
