import {
  component$,
  ErrorBoundary,
  isServer,
  Slot,
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

const EbSyncThrower = component$(() => {
  if (isServer) {
    throw new Error('eb sync boom');
  }
  return <span id="eb-thrower-client" />;
});

// A plain user component that projects its children through its own <Slot>.
const EbWrapper = component$(() => (
  <div data-eb-wrapper="">
    <Slot />
  </div>
));

// Fails during SSR, then recovers when re-executed on the client — so reset() must RE-EXECUTE
// (re-create) the children, not merely re-claim them.
const EbWrapAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb wrap async boom')), 200);
    }) as unknown as JSXOutput;
  }
  return <p id="eb-wrap-recovered">recovered</p>;
});

// Errors on SSR AND on the first client re-execution, then recovers on the second — so a SECOND
// reset() runs a CLIENT re-render of an EB-inside-<Suspense> (the case the reset Suspense-climb targets).
// The run counter is on `window` so it survives the boundary being re-created between resets.
const EbReErrorAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb reerror ssr boom')), 50);
    }) as unknown as JSXOutput;
  }
  const runs = ((window as any).__ebReErrorRuns = ((window as any).__ebReErrorRuns ?? 0) + 1);
  if (runs < 2) {
    throw new Error('eb reerror client boom ' + runs);
  }
  return <p id="eb-reerror-recovered">recovered after {runs} runs</p>;
});

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
  // Capture once into a (serialized) signal so an OWNER re-render — e.g. reset() or a key bump —
  // doesn't recompute the branch from a client-side url that lacks the query string.
  const scenario = useSignal(getSearchParam(url, 'scenario')).value;
  const touched = useSignal(0);
  const inertTrigger = useSignal(0);
  // Dev-owned key for the key-swap reset experiment (scenario `reset-wrapped-key`).
  const attempt = useSignal(0);
  // Toggle that mounts the `reset-spa` boundary CLIENT-FIRST (never SSR'd), simulating SPA navigation.
  const spaShow = useSignal(false);

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
      ) : scenario === 'throw-fallback' ? (
        <ErrorBoundary
          fallback$={(e) => <EbFallback id="eb-outer" msg={String((e as any)?.message ?? e)} />}
        >
          <ErrorBoundary
            fallback$={() => {
              throw new Error('inner fallback boom');
            }}
          >
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
        </ErrorBoundary>
      ) : scenario === 'inert' ? (
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
      ) : scenario === 'no-boundary' ? (
        <>
          <button
            id="eb-no-boundary-throw"
            onClick$={() => {
              touched.value++;
              throw new Error('no-boundary boom');
            }}
          >
            throw on click
          </button>
          <span id="eb-no-boundary-touched">{touched.value}</span>
        </>
      ) : scenario === 'reset' ? (
        <ErrorBoundary
          fallback$={(e, reset) => (
            <section id="eb-fallback">
              <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
              <button id="eb-reset" onClick$={() => reset()}>
                Retry
              </button>
            </section>
          )}
        >
          <EbContent />
          <EbSyncThrower />
        </ErrorBoundary>
      ) : scenario === 'reset-csr' ? (
        <ErrorBoundary
          fallback$={(e, reset) => (
            <section id="eb-fallback">
              <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
              <button id="eb-reset" onClick$={() => reset()}>
                Retry
              </button>
            </section>
          )}
        >
          <EbContent />
          <button
            id="eb-csr-throw"
            onClick$={() => {
              throw new Error('csr reset boom');
            }}
          >
            throw on click
          </button>
        </ErrorBoundary>
      ) : scenario === 'reset-wrapped' ? (
        // A plain <Slot>-projecting component (EbWrapper) sits between the route and the
        // ErrorBoundary; the child does async work that errors on SSR and recovers when re-executed.
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbWrapper>
            <ErrorBoundary
              fallback$={(e, reset) => (
                <section id="eb-fallback">
                  <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
                  <button id="eb-reset" onClick$={() => reset()}>
                    Retry
                  </button>
                </section>
              )}
            >
              <EbWrapAsync />
            </ErrorBoundary>
          </EbWrapper>
        </Suspense>
      ) : scenario === 'reset-wrapped-key' ? (
        // SAME wrapper shape as `reset-wrapped`, but recovery is a dev-owned `key` bump on the
        // <ErrorBoundary> (declared in this children-authoring component), not the built-in reset().
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbWrapper>
            <ErrorBoundary
              key={attempt.value}
              fallback$={(e) => (
                <section id="eb-fallback">
                  <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
                  <button id="eb-reset" onClick$={() => attempt.value++}>
                    Retry
                  </button>
                </section>
              )}
            >
              <EbWrapAsync />
            </ErrorBoundary>
          </EbWrapper>
        </Suspense>
      ) : scenario === 'reset-reerror' ? (
        // EB directly inside <Suspense>, child re-errors once then recovers — so the 2nd reset() runs a
        // CLIENT re-render of the boundary, exercising the reset Suspense-climb.
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <ErrorBoundary
            fallback$={(e, reset) => (
              <section id="eb-fallback">
                <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
                <button id="eb-reset" onClick$={() => reset()}>
                  Retry
                </button>
              </section>
            )}
          >
            <EbReErrorAsync />
          </ErrorBoundary>
        </Suspense>
      ) : scenario === 'reset-spa' ? (
        // SPA-nav equivalent (this app has no router): the EB-in-<Suspense> is mounted CLIENT-FIRST via
        // a toggle, so it is never SSR'd and has NO serialized $resetOwner$ — reset() must resolve the
        // owner purely at runtime (getParentHost + the Suspense-climb). Child errors then recovers.
        <>
          <button id="eb-spa-show" onClick$={() => (spaShow.value = true)}>
            Show
          </button>
          {spaShow.value ? (
            <Suspense fallback={<span id="eb-skel">loading</span>}>
              <ErrorBoundary
                fallback$={(e, reset) => (
                  <section id="eb-fallback">
                    <p id="eb-fallback-msg">caught: {String((e as any)?.message ?? e)}</p>
                    <button id="eb-reset" onClick$={() => reset()}>
                      Retry
                    </button>
                  </section>
                )}
              >
                <EbReErrorAsync />
              </ErrorBoundary>
            </Suspense>
          ) : null}
        </>
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
