import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbSyncThrower,
  EbThrowOnClick,
  innerFallback,
  outerFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={outerFallback}>
    <EbThrowOnClick idPrefix="eb-outer" message="outer click boom" label="trigger outer" />
    <ErrorBoundary fallback$={innerFallback}>
      <EbSyncThrower />
    </ErrorBoundary>
  </ErrorBoundary>
));
