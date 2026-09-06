import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbSyncThrower,
  innerFallback,
  outerFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={outerFallback}>
    <ErrorBoundary fallback$={innerFallback}>
      <EbSyncThrower />
    </ErrorBoundary>
    <EbSyncThrower />
  </ErrorBoundary>
));
