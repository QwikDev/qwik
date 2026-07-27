import { component$, ErrorBoundary, isServer, type JSXOutput } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// An async-generator child throws mid-stream; the boundary swaps to its fallback.
const EbAsyncGenThrower = component$(() => {
  if (isServer) {
    return (
      <>
        {(async function* () {
          yield <span id="eb-gen-chunk">chunk</span>;
          throw new Error('async gen boom');
        })()}
      </>
    ) as unknown as JSXOutput;
  }
  return <span id="eb-gen-client" />;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbAsyncGenThrower />
  </ErrorBoundary>
));
