import { component$ } from '@qwik.dev/core';
import { EbThrowOnClick } from '../../components/error-boundary/error-boundary';

// No ErrorBoundary: a client throw must surface to the global handler.
export default component$(() => (
  <EbThrowOnClick idPrefix="eb-no-boundary" message="no-boundary boom" />
));
