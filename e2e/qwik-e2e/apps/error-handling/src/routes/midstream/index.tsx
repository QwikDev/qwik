import { component$, ErrorBoundary, Suspense, useServerData, useSignal } from '@qwik.dev/core';
import {
  EbContent,
  EbSyncThrower,
  resetFallback,
} from '../../components/error-boundary/error-boundary';
import { EbGatedOk, ReleaseButton } from '../../components/release/release';
import { WEBKIT_STREAMING_FLUSH } from '../../../../../utils/webkit-flush';

export default component$(() => {
  const url = useServerData<string>('url');
  const params = url ? new URL(url).searchParams : null;
  const releaseId = params?.get('release') ?? null;
  const webkitFlush = params?.get('webkitFlush') === '1';
  const requestId = useSignal(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ).value;
  return (
    <>
      {webkitFlush ? (
        <div aria-hidden="true" style="width:0px;height:0px;overflow:hidden">
          {WEBKIT_STREAMING_FLUSH}
        </div>
      ) : null}
      <ErrorBoundary fallback$={resetFallback}>
        <EbContent />
        <EbSyncThrower />
      </ErrorBoundary>
      <ReleaseButton
        id="eb-release"
        requestId={requestId}
        releaseId={releaseId}
        label="Release gated ok"
      />
      <Suspense fallback={<span id="eb-skel">loading</span>}>
        <EbGatedOk requestId={requestId} releaseId={releaseId} />
      </Suspense>
    </>
  );
});
