import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbThrowOnClick,
  innerFallback,
  outerFallback,
} from '../../components/error-boundary/error-boundary';

export default component$(() => (
  <ErrorBoundary fallback$={outerFallback}>
    <div id="eb-outer-ok">outer ok</div>
    <ErrorBoundary fallback$={innerFallback}>
      <EbThrowOnClick idPrefix="eb-inner" message="inner client boom" />
      <div id="eb-content">content ok</div>
    </ErrorBoundary>
  </ErrorBoundary>
));
