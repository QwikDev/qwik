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
  const url = useServerData<string>('url');
  const releaseId = url ? new URL(url).searchParams.get('release') : null;
  const requestId = useSignal(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ).value;
  return (
    <>
      <Catch fallback$={defaultFallback}>
        <div id="catch-sibling">sibling</div>
        <Pending fallback={<span id="catch-skel">loading</span>}>
          <CatchAsyncThrower requestId={requestId} releaseId={releaseId} />
        </Pending>
      </Catch>
      <ReleaseButton requestId={requestId} releaseId={releaseId} label="Release deferred throw" />
    </>
  );
});
