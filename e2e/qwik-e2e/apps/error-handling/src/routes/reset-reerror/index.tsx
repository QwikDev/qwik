import { component$, ErrorBoundary, isServer, Suspense, type JSXOutput } from '@qwik.dev/core';
import { EbReErrorAsync, resetFallback } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <Suspense fallback={<span id="eb-skel">loading</span>}>
    <ErrorBoundary fallback$={resetFallback}>
      <EbReErrorAsync />
    </ErrorBoundary>
  </Suspense>
));
