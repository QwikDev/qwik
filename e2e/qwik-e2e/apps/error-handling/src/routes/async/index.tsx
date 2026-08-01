import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useServerData,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { releaseGated } from '../../../../../release-gate';
import { defaultFallback } from '../../components/error-boundary/error-boundary';
import { ReleaseButton } from '../../components/release/release';

const EbAsyncThrower = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      return releaseGated(requestId, releaseId, (): JSXOutput => {
        throw new Error('eb async boom');
      }) as unknown as JSXOutput;
    }
    return <span id="eb-async-client" />;
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
      <ErrorBoundary fallback$={defaultFallback}>
        <div id="eb-sibling">sibling</div>
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbAsyncThrower requestId={requestId} releaseId={releaseId} />
        </Suspense>
      </ErrorBoundary>
      <ReleaseButton
        id="eb-release"
        requestId={requestId}
        releaseId={releaseId}
        label="Release deferred throw"
      />
    </>
  );
});
