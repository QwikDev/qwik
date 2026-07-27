import { component$, ErrorBoundary } from '@qwik.dev/core';
import {
  EbContent,
  EbFallback,
  EbSyncThrower,
  errMsg,
} from '../../components/error-boundary/error-boundary';

// A throwing inner fallback escalates to the outer boundary.
export default component$(() => (
  <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
    <ErrorBoundary
      fallback$={() => {
        throw new Error('inner fallback boom');
      }}
    >
      <EbContent />
      <EbSyncThrower />
    </ErrorBoundary>
  </ErrorBoundary>
));
