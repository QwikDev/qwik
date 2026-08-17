import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbContent,
  EbSyncThrower,
  outerFallback,
} from '../../components/error-boundary/error-boundary';

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
