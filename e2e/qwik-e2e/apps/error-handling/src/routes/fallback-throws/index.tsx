import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbContent,
  EbSyncThrower,
  outerFallback,
} from '../../components/error-boundary/error-boundary';

// A throwing inner fallback escalates to the outer boundary.
export default component$(() => (
  <ErrorBoundary fallback$={outerFallback}>
    <ErrorBoundary
      fallback$={() => {
        throw new Error('inner fallback boom');
      }}
    >
      <EbContent />
      <EbSyncThrower />
    </ErrorBoundary>
  </ErrorBoundary>
));
