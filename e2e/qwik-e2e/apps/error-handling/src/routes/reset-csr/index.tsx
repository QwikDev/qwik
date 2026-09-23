import { component$, ErrorBoundary } from '@qwik.dev/core';
import { EbContent, resetFallback } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <EbContent />
    <button
      id="eb-csr-throw"
      onClick$={() => {
        throw new Error('csr reset boom');
      }}
    >
      throw on click
    </button>
  </ErrorBoundary>
));
