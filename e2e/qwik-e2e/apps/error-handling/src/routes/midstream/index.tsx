import { component$, Catch, Pending, useServerData, useSignal } from '@qwik.dev/core';
import { CatchContent, CatchSyncThrower, resetFallback } from '../../components/catch/catch';
import { CatchGatedOk, ReleaseButton } from '../../components/release/release';
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
      <Catch fallback$={resetFallback}>
        <CatchContent />
        <CatchSyncThrower />
      </Catch>
      <ReleaseButton requestId={requestId} releaseId={releaseId} label="Release gated ok" />
      <Pending fallback$={() => <span id="catch-skel">loading</span>}>
        <CatchGatedOk requestId={requestId} releaseId={releaseId} />
      </Pending>
    </>
  );
});
