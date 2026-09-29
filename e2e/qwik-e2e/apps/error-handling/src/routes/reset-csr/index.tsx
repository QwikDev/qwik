import { component$, Catch } from '@qwik.dev/core';
import { CatchContent, resetFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={resetFallback}>
    <CatchContent />
    <button
      id="catch-csr-throw"
      onClick$={() => {
        throw new Error('csr reset boom');
      }}
    >
      throw on click
    </button>
  </Catch>
));
