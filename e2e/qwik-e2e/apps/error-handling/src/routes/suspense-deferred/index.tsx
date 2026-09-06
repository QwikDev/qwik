import { component$, ErrorBoundary, isServer, Suspense, type JSXOutput } from '@qwik.dev/core';
import {
  defaultFallback,
  EbContent,
  EbSyncThrower,
} from '../../components/error-boundary/error-boundary';

const EbDeferredOk = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 50);
    }) as unknown as JSXOutput;
  }
  return <span id="eb-deferred-ok">deferred ok</span>;
});

export default component$(() => (
  <Suspense fallback={<span id="eb-skel">loading</span>}>
    <EbDeferredOk />
    <ErrorBoundary fallback$={defaultFallback}>
      <EbContent />
      <EbSyncThrower />
    </ErrorBoundary>
  </Suspense>
));
