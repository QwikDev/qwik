import {
  component$,
  ErrorBoundary,
  isServer,
  Suspense,
  useServerData,
  useSignal,
  useTask$,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';
import { ManualOutOfOrderReleaseButton } from '../suspense/ooos';

const getSearchParam = (url: string | undefined, name: string): string | null =>
  url ? new URL(url).searchParams.get(name) : null;

// Shared with ooos.tsx and the release endpoint so a test can deterministically trigger a deferred throw.
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

// `id` prefixes markers so nested boundaries can tell their fallbacks apart.
const EbFallback = component$((props: { msg: string; id?: string }) => {
  const id = props.id ?? 'eb-fallback';
  const count = useSignal(0);
  return (
    <section id={id}>
      <p id={`${id}-msg`}>caught: {props.msg}</p>
      <button id={`${id}-button`} onClick$={() => count.value++}>
        Touch fallback
      </button>
      <span id={`${id}-count`}>{count.value}</span>
    </section>
  );
});

// Resolves after a tick so the enclosing `<Suspense>` genuinely defers into an out-of-order segment.
const EbDeferredOk = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 50);
    }) as unknown as JSXOutput;
  }
  return <span id="eb-deferred-ok">deferred ok</span>;
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

// Throws only during SSR so the boundary streams its content first, then swaps.
const EbSyncThrower = component$(() => {
  if (isServer) {
    throw new Error('eb sync boom');
  }
  return <span id="eb-thrower-client" />;
});

// Records client task runs on `window` so a test can assert the swapped-out task never re-runs.
const EbInertContent = component$<{ trigger: Signal<number> }>((props) => {
  useTask$(({ track }) => {
    track(() => props.trigger.value);
    if (!isServer) {
      (window as any).__ebDeadTaskClientRuns = ((window as any).__ebDeadTaskClientRuns ?? 0) + 1;
    }
  });
  return (
    <div id="eb-content">
      <p>streamed content</p>
      <EbSyncThrower />
    </div>
  );
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
  const touched = useSignal(0);
  const inertTrigger = useSignal(0);

  return (
    <main>
      <h1 id="eb-title">EB Streaming</h1>
      {scenario === 'happy' ? (
        // No SSR throw; touch state first so the container resumes before the client throw routes.
        <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
          <EbContent />
          <button
            id="eb-content-throw"
            onClick$={() => {
              touched.value++;
              throw new Error('happy click boom');
            }}
          >
            throw on click
          </button>
          <span id="eb-content-touched">{touched.value}</span>
        </ErrorBoundary>
      ) : scenario === 'suspense' ? (
        // The deferred-ok sibling forces a real out-of-order segment so the boundary swaps within it.
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbDeferredOk />
          <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
        </Suspense>
      ) : scenario === 'nested' ? (
        // An outer-boundary throw replaces the whole subtree, including the inner boundary's fallback.
        <ErrorBoundary
          fallback$={(e) => <EbFallback id="eb-outer" msg={String((e as any)?.message ?? e)} />}
        >
          <button
            id="eb-outer-throw"
            onClick$={() => {
              touched.value++;
              throw new Error('outer click boom');
            }}
          >
            trigger outer
          </button>
          <span id="eb-outer-touched">{touched.value}</span>
          <ErrorBoundary
            fallback$={(e) => <EbFallback id="eb-inner" msg={String((e as any)?.message ?? e)} />}
          >
            <EbSyncThrower />
          </ErrorBoundary>
        </ErrorBoundary>
      ) : scenario === 'inert' ? (
        // Bumping the signal from outside the boundary must not re-run the swapped-out task.
        <>
          <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
            <EbInertContent trigger={inertTrigger} />
          </ErrorBoundary>
          <button id="eb-inert-trigger" onClick$={() => inertTrigger.value++}>
            bump signal
          </button>
          <span id="eb-inert-val">{inertTrigger.value}</span>
        </>
      ) : scenario === 'async' ? (
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
        // Touch a signal first so the container resumes before the client throw routes to the fallback.
        <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
          <button
            id="eb-client-throw"
            onClick$={() => {
              touched.value++;
              throw new Error('client click boom');
            }}
          >
            throw on click
          </button>
          <span id="eb-client-touched">{touched.value}</span>
          <div id="eb-content">content ok</div>
        </ErrorBoundary>
      ) : scenario === 'onerror' ? (
        // Records `onError$` runs on `window` so the test can assert it fired exactly once.
        <ErrorBoundary
          fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}
          onError$={(e) => {
            (window as any).__ebOnErrorRuns = ((window as any).__ebOnErrorRuns ?? 0) + 1;
            (window as any).__ebOnErrorMsg = (e as any)?.message ?? String(e);
          }}
        >
          <button
            id="eb-onerror-throw"
            onClick$={() => {
              touched.value++;
              throw new Error('onerror boom');
            }}
          >
            throw on click
          </button>
          <span id="eb-onerror-touched">{touched.value}</span>
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
