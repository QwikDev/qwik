import {
  component$,
  Catch,
  isServer,
  Pending,
  useServerData,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { releaseGated } from '../../../../../utils/release-gate';
import { WEBKIT_STREAMING_FLUSH } from '../../../../../utils/webkit-flush';
import { defaultFallback } from '../../components/catch/catch';
import { ReleaseButton } from '../../components/release/release';

const CatchAsyncThrower = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      return releaseGated(requestId, releaseId, (): JSXOutput => {
        throw new Error('catch async boom');
      }) as unknown as JSXOutput;
    }
    return <span id="catch-async-client" />;
  }
);

export default component$(() => {
  const count = useSignal(0);
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
      <button id="catch-shell-button" onClick$={() => count.value++}>
        Touch shell
      </button>
      <span id="catch-shell-count">{count.value}</span>
      <Catch fallback$={defaultFallback}>
        <div id="catch-sibling">sibling</div>
        <Pending fallback$={() => <span id="catch-skel">loading</span>}>
          <CatchAsyncThrower requestId={requestId} releaseId={releaseId} />
        </Pending>
      </Catch>
      <ReleaseButton requestId={requestId} releaseId={releaseId} label="Release deferred throw" />
    </>
  );
});
