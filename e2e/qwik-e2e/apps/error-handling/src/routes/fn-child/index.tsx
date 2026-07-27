import { component$, ErrorBoundary, isServer } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// A function child is invoked during render; its throw routes to the boundary.
export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <div id="eb-fn-host">
      {(() => {
        if (isServer) {
          throw new Error('fn-child boom');
        }
        return <span id="eb-fn-client">ok</span>;
      })()}
    </div>
  </ErrorBoundary>
));
