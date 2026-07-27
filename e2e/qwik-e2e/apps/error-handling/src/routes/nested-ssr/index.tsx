import { component$, ErrorBoundary } from '@qwik.dev/core';
import { EbFallback, EbSyncThrower, errMsg } from '../../components/error-boundary/error-boundary';

// The outer's own SSR throw supersedes the already-swapped inner fallback.
export default component$(() => (
  <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
    <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
      <EbSyncThrower />
    </ErrorBoundary>
    <EbSyncThrower />
  </ErrorBoundary>
));
