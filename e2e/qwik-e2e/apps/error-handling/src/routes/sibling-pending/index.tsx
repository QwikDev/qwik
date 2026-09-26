import { component$, Catch, Pending, useServerData, useSignal } from '@qwik.dev/core';
import { defaultFallback, CatchContent, CatchSyncThrower } from '../../components/catch/catch';
import { CatchGatedOk, ReleaseButton } from '../../components/release/release';

export default component$(() => {
  const url = useServerData<string>('url');
  const releaseId = url ? new URL(url).searchParams.get('release') : null;
  const requestId = useSignal(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ).value;
  return (
    <>
      <Catch fallback$={defaultFallback}>
        <CatchContent />
        <CatchSyncThrower />
      </Catch>
      <Pending fallback$={() => <span id="catch-skel">loading</span>}>
        <CatchGatedOk requestId={requestId} releaseId={releaseId} />
      </Pending>
      <ReleaseButton requestId={requestId} releaseId={releaseId} label="Release deferred ok" />
    </>
  );
});
