import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useServerData,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { ManualOutOfOrderReleaseButton } from '../suspense/ooos';

const getSearchParam = (url: string | undefined, name: string): string | null =>
  url ? new URL(url).searchParams.get(name) : null;

// Reuse the shared out-of-order release store (same one ooos.tsx and the dev-server release endpoint
// use) so a test can deterministically trigger a deferred throw.
type ReleaseStore = { resolved: Set<string>; resolvers: Map<string, Set<() => void>> };
const getReleaseStore = (): ReleaseStore =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });
const waitForRelease = (requestId: string, releaseId: string): Promise<void> =>
  new Promise<void>((resolve) => {
    const store = getReleaseStore();
    const key = `${requestId}:${releaseId}`;
    if (store.resolved.has(key)) {
      resolve();
      return;
    }
    let resolvers = store.resolvers.get(key);
    if (!resolvers) {
      store.resolvers.set(key, (resolvers = new Set()));
    }
    resolvers.add(resolve);
  });

const EbFallback = component$((props: { msg: string }) => {
  const count = useSignal(0);
  return (
    <section id="eb-fallback">
      <p id="eb-fallback-msg">caught: {props.msg}</p>
      <button id="eb-fallback-button" onClick$={() => count.value++}>
        Touch fallback
      </button>
      <span id="eb-fallback-count">{count.value}</span>
    </section>
  );
});

const EbContent = component$(() => {
  const count = useSignal(0);
  return (
    <section id="eb-content">
      <p>streamed content</p>
      <button id="eb-content-button" onClick$={() => count.value++}>
        Touch content
      </button>
      <span id="eb-content-count">{count.value}</span>
    </section>
  );
});

// Throws during SSR (only on the server) — the boundary streams its content first, then swaps.
const EbSyncThrower = component$(() => {
  if (isServer) {
    throw new Error('eb sync boom');
  }
  return <span id="eb-thrower-client" />;
});

// A deferred child whose async work rejects after its Suspense placeholder has streamed.
const EbAsyncThrower = component$(() => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, 'release');
    if (releaseId && requestId) {
      return waitForRelease(requestId, releaseId).then(() => {
        throw new Error('eb async boom');
      }) as unknown as JSXOutput;
    }
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb async boom')), 1000);
    }) as unknown as JSXOutput;
  }
  return <span id="eb-async-client" />;
});

export const ErrorBoundaryStreamingRoot = component$(() => {
  const url = useServerData<string>('url');
  const scenario = getSearchParam(url, 'scenario');

  return (
    <main>
      <h1 id="eb-title">EB Streaming</h1>
      {scenario === 'async' ? (
        <>
          <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
            <div id="eb-sibling">sibling</div>
            <Suspense fallback={<span id="eb-skel">loading</span>}>
              <EbAsyncThrower />
            </Suspense>
          </ErrorBoundary>
          <ManualOutOfOrderReleaseButton
            id="eb-release"
            label="Release deferred throw"
            releaseParam="release"
          />
        </>
      ) : scenario === 'client' ? (
        // Streams fine (no SSR error); a later client-time throw must re-render to the fallback.
        <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
          <button
            id="eb-client-throw"
            onClick$={() => {
              throw new Error('client click boom');
            }}
          >
            throw on click
          </button>
          <div id="eb-content">content ok</div>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
          <EbContent />
          <EbSyncThrower />
        </ErrorBoundary>
      )}
      <footer id="eb-footer">Footer shell</footer>
    </main>
  );
});
