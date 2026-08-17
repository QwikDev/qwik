import { component$, ErrorBoundary, Suspense } from '@qwik.dev/core';
import {
  EbWrapAsync,
  EbWrapper,
  resetFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <Suspense fallback={<span id="eb-skel">loading</span>}>
    <EbWrapper>
      <ErrorBoundary fallback$={resetFallback}>
        <EbWrapAsync />
      </ErrorBoundary>
    </EbWrapper>
  </Suspense>
));
