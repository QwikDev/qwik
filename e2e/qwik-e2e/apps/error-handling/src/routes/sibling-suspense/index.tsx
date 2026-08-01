import { component$, ErrorBoundary, Suspense, useServerData, useSignal } from '@qwik.dev/core';
import {
  defaultFallback,
  EbContent,
  EbSyncThrower,
} from '../../components/error-boundary/error-boundary';
import { EbGatedOk, ReleaseButton } from '../../components/release/release';

export default component$(() => {
  const url = useServerData<string>('url');
  const releaseId = url ? new URL(url).searchParams.get('release') : null;
  const requestId = useSignal(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ).value;
  return (
    <>
      <ErrorBoundary fallback$={defaultFallback}>
        <EbContent />
        <EbSyncThrower />
      </ErrorBoundary>
      <Suspense fallback={<span id="eb-skel">loading</span>}>
        <EbGatedOk requestId={requestId} releaseId={releaseId} />
      </Suspense>
      <ReleaseButton
        id="eb-release"
        requestId={requestId}
        releaseId={releaseId}
        label="Release deferred ok"
      />
    </>
  );
});
