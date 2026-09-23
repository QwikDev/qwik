import { component$, ErrorBoundary } from '@qwik.dev/core';
import { defaultFallback, EbThrowOnClick } from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbThrowOnClick idPrefix="eb-last-resort" message="last-resort boom" />
    <div id="eb-content">content ok</div>
  </ErrorBoundary>
));
