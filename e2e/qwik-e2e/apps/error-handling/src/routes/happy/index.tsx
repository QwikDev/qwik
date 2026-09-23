import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  defaultFallback,
  EbContent,
  EbThrowOnClick,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbContent />
    <EbThrowOnClick idPrefix="eb-content" message="happy click boom" />
  </ErrorBoundary>
));
