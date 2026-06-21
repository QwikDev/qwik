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

// `id` prefixes every marker so nested boundaries (the `nested` scenario) can tell their fallbacks
// apart; it defaults to `eb-fallback` so the single-boundary scenarios keep their existing ids.
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

// Resolves after a tick so the enclosing `<Suspense>` genuinely defers into an out-of-order segment
// (used by the `suspense` scenario, where an ErrorBoundary then throws synchronously inside it).
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

// Throws during SSR (only on the server) — the boundary streams its content first, then swaps.
const EbSyncThrower = component$(() => {
  if (isServer) {
    throw new Error('eb sync boom');
  }
  return <span id="eb-thrower-client" />;
});

// Inert probe: the swapped-out content holds a useTask$ that tracks a signal and records each
// CLIENT run on `window`. The SSR throw (its child EbSyncThrower) swaps this content out; bumping the
// tracked signal from OUTSIDE the boundary must NOT re-run this dead task on the client.
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
        // No SSR throw: the content streams and stays interactive after resume, no fallback, no swap
        // script. A later client-time throw (touch state first so the container resumes) is then
        // caught by the boundary — the full behavior the legacy Qwik Router test exercised.
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
        // Case b: an ErrorBoundary INSIDE a deferred `<Suspense>` segment. The deferred-ok sibling
        // forces a real out-of-order segment; the boundary's child throws synchronously inside it, so
        // the hoisted `qErr(id)` swaps the boundary within the segment.
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbDeferredOk />
          <ErrorBoundary fallback$={(e) => <EbFallback msg={String((e as any)?.message ?? e)} />}>
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
        </Suspense>
      ) : scenario === 'nested' ? (
        // D2 cross-phase: the inner boundary errors on SSR (shows its fallback). A later client throw
        // from a sibling of the inner boundary routes to the OUTER boundary, whose fallback then
        // replaces the whole subtree — including the inner fallback.
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
        // SSR error swaps out content that holds a signal-tracking task; bumping the signal from
        // OUTSIDE the boundary must not re-run the dead task on the client.
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
        // Streams fine (no SSR error); a later client-time throw must re-render to the fallback.
        // The handler touches a signal first so the container resumes and the qerror actually routes.
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
