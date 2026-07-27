import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useServerData,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import {
  EbContent,
  EbSyncThrower,
  resetFallback,
} from '../../components/error-boundary/error-boundary';

const WEBKIT_STREAMING_FLUSH = '\u200b'.repeat(512);

const releaseStore = () =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

const waitForRelease = (requestId: string, releaseId: string): Promise<void> =>
  new Promise<void>((resolve) => {
    const store = releaseStore();
    const key = `${requestId}:${releaseId}`;
    if (store.resolved.has(key)) {
      resolve();
    } else {
      let resolvers = store.resolvers.get(key);
      if (!resolvers) {
        store.resolvers.set(key, (resolvers = new Set()));
      }
      resolvers.add(resolve);
    }
  });

const ReleaseButton = component$<{ id: string; requestId: string; releaseId: string | null }>(
  ({ id, requestId, releaseId }) => {
    if (!releaseId) {
      return null;
    }
    const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
      releaseId
    )}`;
    const html = `<button id="${id}" data-release-url="${releaseUrl}" onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})">Release gated ok</button>`;
    return <span dangerouslySetInnerHTML={html} />;
  }
);

const EbGatedOk = component$<{ requestId: string; releaseId: string | null }>(
  ({ requestId, releaseId }) => {
    if (isServer) {
      if (releaseId) {
        return waitForRelease(requestId, releaseId).then(() => (
          <span id="eb-deferred-ok">deferred ok</span>
        )) as unknown as JSXOutput;
      }
      return new Promise<JSXOutput>((resolve) => {
        setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 1000);
      }) as unknown as JSXOutput;
    }
    return <span id="eb-deferred-ok">deferred ok</span>;
  }
);

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
      <ReleaseButton id="eb-release" requestId={requestId} releaseId={releaseId} />
      <Suspense fallback={<span id="eb-skel">loading</span>}>
        <EbGatedOk requestId={requestId} releaseId={releaseId} />
      </Suspense>
    </>
  );
});
