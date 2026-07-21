import {
  $,
  component$,
  ErrorBoundary,
  isServer,
  Resource,
  Slot,
  Suspense,
  useAsync$,
  useResource$,
  useServerData,
  useSignal,
  useTask$,
  useVisibleTask$,
  type JSXOutput,
  type QRL,
  type Signal,
} from '@qwik.dev/core';
import {
  getSearchParam,
  ManualOutOfOrderReleaseButton,
  waitForRelease,
  WEBKIT_STREAMING_FLUSH,
} from '../suspense/ooos';

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

const errMsg = (e: unknown) => String((e as any)?.message ?? e);

// Explicit `$()`: identifier-valued `$`-props aren't extracted (Q34).
const defaultFallback = $((e: unknown) => <EbFallback msg={errMsg(e)} />);

const resetFallback = $((e: unknown, reset: QRL<() => void>) => (
  <section id="eb-fallback">
    <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
    <button id="eb-reset" onClick$={() => reset()}>
      Retry
    </button>
  </section>
));

const EbThrowOnClick = component$<{
  idPrefix: string;
  message: string;
  touched: Signal<number>;
  label?: string;
}>((props) => (
  <>
    <button
      id={`${props.idPrefix}-throw`}
      onClick$={() => {
        props.touched.value++;
        throw new Error(props.message);
      }}
    >
      {props.label ?? 'throw on click'}
    </button>
    <span id={`${props.idPrefix}-touched`}>{props.touched.value}</span>
  </>
));

const EbDeferredOk = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 50);
    }) as unknown as JSXOutput;
  }
  return <span id="eb-deferred-ok">deferred ok</span>;
});

// Release-gated (not timed) so pre-release assertions cannot race.
const EbGatedOk = component$(() => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, 'release');
    if (releaseId && requestId) {
      return waitForRelease(requestId, releaseId).then(() => (
        <span id="eb-deferred-ok">deferred ok</span>
      )) as unknown as JSXOutput;
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<span id="eb-deferred-ok">deferred ok</span>), 1000);
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

const EbWrapper = component$(() => (
  <div data-eb-wrapper="">
    <Slot />
  </div>
));

const EbWrapAsync = component$(() => {
  if (isServer) {
    return new Promise<JSXOutput>((_resolve, reject) => {
      setTimeout(() => reject(new Error('eb wrap async boom')), 200);
    }) as unknown as JSXOutput;
  }
  return <p id="eb-wrap-recovered">recovered</p>;
});

// `window` counter survives boundary re-creation across resets.
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

const EbVisibleTaskThrower = component$(() => {
  useVisibleTask$(() => {
    throw new Error('visible boom');
  });
  return <div id="eb-content">streamed content</div>;
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

// useAsync$: `.error` handles inline; `.value` re-throws to the boundary.
const AsyncErrorInline = component$(() => {
  const data = useAsync$(async () => {
    throw new Error('expected-async-error');
  });
  if (data.loading) {
    return <span id="async-loading">loading</span>;
  }
  return <div id="async-error">handled: {(data.error as Error)?.message ?? 'none'}</div>;
});

const AsyncValueThrows = component$(() => {
  const data = useAsync$(async () => {
    throw new Error('unexpected-async-error');
  });
  return <div id="async-value">{String(data.value)}</div>;
});

// Inlined during SSR so swap scripts run with a real currentScript.
const EbEmbeddedFragment = component$(() => {
  const fragmentHtml = useResource$<string>(async () => {
    const url = `http://localhost:${(globalThis as any).PORT}/e2e/error-boundary-streaming?fragment&loader=false&outOfOrder=false`;
    const res = await fetch(url);
    return res.text();
  });
  return (
    <Resource
      value={fragmentHtml}
      onResolved={(html) => <div id="eb-embed" dangerouslySetInnerHTML={html} />}
    />
  );
});

export const ErrorBoundaryStreamingRoot = component$(() => {
  const url = useServerData<string>('url');
  // Serialized once so a reset()/key re-render keeps the query-less client url.
  const scenario = useSignal(getSearchParam(url, 'scenario')).value;
  // WebKit buffers mid-stream inline scripts; pad or the qwikloader never runs.
  const webkitFlush = getSearchParam(url, 'webkitFlush') === '1';
  const touched = useSignal(0);
  const inertTrigger = useSignal(0);
  const attempt = useSignal(0);
  const spaShow = useSignal(false);

  return (
    <main>
      {webkitFlush ? (
        <div aria-hidden="true" style="width:0px;height:0px;overflow:hidden">
          {WEBKIT_STREAMING_FLUSH}
        </div>
      ) : null}
      <h1 id="eb-title">EB Streaming</h1>
      {scenario === 'happy' ? (
        <ErrorBoundary fallback$={defaultFallback}>
          <EbContent />
          <EbThrowOnClick idPrefix="eb-content" message="happy click boom" touched={touched} />
        </ErrorBoundary>
      ) : scenario === 'suspense' ? (
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbDeferredOk />
          <ErrorBoundary fallback$={defaultFallback}>
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
        </Suspense>
      ) : scenario === 'sibling-suspense' ? (
        // Main-flow swap beside a live deferred segment: qErr and qO coexist.
        <>
          <ErrorBoundary fallback$={defaultFallback}>
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
          <Suspense fallback={<span id="eb-skel">loading</span>}>
            <EbGatedOk />
          </Suspense>
          <ManualOutOfOrderReleaseButton
            id="eb-release"
            label="Release deferred ok"
            releaseParam="release"
          />
        </>
      ) : scenario === 'midstream' ? (
        // Gated sibling holds the stream open before qwik/state arrives.
        <>
          <ErrorBoundary fallback$={resetFallback}>
            <EbContent />
            <EbSyncThrower />
          </ErrorBoundary>
          <ManualOutOfOrderReleaseButton
            id="eb-release"
            label="Release gated ok"
            releaseParam="release"
          />
          <Suspense fallback={<span id="eb-skel">loading</span>}>
            <EbGatedOk />
          </Suspense>
        </>
      ) : scenario === 'nested' ? (
        <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
          <EbThrowOnClick
            idPrefix="eb-outer"
            message="outer click boom"
            touched={touched}
            label="trigger outer"
          />
          <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
            <EbSyncThrower />
          </ErrorBoundary>
        </ErrorBoundary>
      ) : scenario === 'nested-ssr' ? (
        // Outer's own throw supersedes the inner swap into inert content.
        <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
          <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
            <EbSyncThrower />
          </ErrorBoundary>
          <EbSyncThrower />
        </ErrorBoundary>
      ) : scenario === 'throw-fallback' ? (
        <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
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
          <ErrorBoundary fallback$={defaultFallback}>
            <EbInertContent trigger={inertTrigger} />
          </ErrorBoundary>
          <button id="eb-inert-trigger" onClick$={() => inertTrigger.value++}>
            bump signal
          </button>
          <span id="eb-inert-val">{inertTrigger.value}</span>
        </>
      ) : scenario === 'async' ? (
        <>
          <ErrorBoundary fallback$={defaultFallback}>
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
        <ErrorBoundary fallback$={defaultFallback}>
          <EbThrowOnClick idPrefix="eb-client" message="client click boom" touched={touched} />
          <div id="eb-content">content ok</div>
        </ErrorBoundary>
      ) : scenario === 'visible-task' ? (
        <ErrorBoundary fallback$={defaultFallback}>
          <EbVisibleTaskThrower />
        </ErrorBoundary>
      ) : scenario === 'onerror' ? (
        <ErrorBoundary
          fallback$={defaultFallback}
          onError$={(e, info) => {
            (window as any).__ebOnErrorRuns = ((window as any).__ebOnErrorRuns ?? 0) + 1;
            (window as any).__ebOnErrorMsg = (e as any)?.message ?? String(e);
            (window as any).__ebOnErrorPhase = info?.phase;
            (window as any).__ebOnErrorBoundaryId = info?.boundaryId;
          }}
        >
          <EbThrowOnClick idPrefix="eb-onerror" message="onerror boom" touched={touched} />
          <div id="eb-content">content ok</div>
        </ErrorBoundary>
      ) : scenario === 'no-boundary' ? (
        <EbThrowOnClick idPrefix="eb-no-boundary" message="no-boundary boom" touched={touched} />
      ) : scenario === 'reset' ? (
        <ErrorBoundary fallback$={resetFallback}>
          <EbContent />
          <EbSyncThrower />
        </ErrorBoundary>
      ) : scenario === 'reset-csr' ? (
        <ErrorBoundary fallback$={resetFallback}>
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
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbWrapper>
            <ErrorBoundary fallback$={resetFallback}>
              <EbWrapAsync />
            </ErrorBoundary>
          </EbWrapper>
        </Suspense>
      ) : scenario === 'reset-wrapped-key' ? (
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <EbWrapper>
            <ErrorBoundary
              key={attempt.value}
              fallback$={(e) => (
                <section id="eb-fallback">
                  <p id="eb-fallback-msg">caught: {errMsg(e)}</p>
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
        <Suspense fallback={<span id="eb-skel">loading</span>}>
          <ErrorBoundary fallback$={resetFallback}>
            <EbReErrorAsync />
          </ErrorBoundary>
        </Suspense>
      ) : scenario === 'reset-spa' ? (
        <>
          <button id="eb-spa-show" onClick$={() => (spaShow.value = true)}>
            Show
          </button>
          {spaShow.value ? (
            <Suspense fallback={<span id="eb-skel">loading</span>}>
              <ErrorBoundary fallback$={resetFallback}>
                <EbReErrorAsync />
              </ErrorBoundary>
            </Suspense>
          ) : null}
        </>
      ) : scenario === 'async-error-inline' ? (
        <ErrorBoundary fallback$={defaultFallback}>
          <AsyncErrorInline />
        </ErrorBoundary>
      ) : scenario === 'async-error-throw' ? (
        <ErrorBoundary fallback$={defaultFallback}>
          <Suspense fallback={<span id="async-loading">loading</span>}>
            <AsyncValueThrows />
          </Suspense>
        </ErrorBoundary>
      ) : scenario === 'nested-client' ? (
        <ErrorBoundary fallback$={(e) => <EbFallback id="eb-outer" msg={errMsg(e)} />}>
          <div id="eb-outer-ok">outer ok</div>
          <ErrorBoundary fallback$={(e) => <EbFallback id="eb-inner" msg={errMsg(e)} />}>
            <EbThrowOnClick idPrefix="eb-inner" message="inner client boom" touched={touched} />
            <div id="eb-content">content ok</div>
          </ErrorBoundary>
        </ErrorBoundary>
      ) : scenario === 'last-resort' ? (
        <ErrorBoundary fallback$={defaultFallback}>
          <EbThrowOnClick idPrefix="eb-last-resort" message="last-resort boom" touched={touched} />
          <div id="eb-content">content ok</div>
        </ErrorBoundary>
      ) : scenario === 'multi-container' ? (
        <>
          <ErrorBoundary fallback$={(e) => <EbFallback id="eb-host-fb" msg={errMsg(e)} />}>
            <section id="eb-host-content">
              <p>host content</p>
              <button id="eb-host-button" onClick$={() => touched.value++}>
                Touch host
              </button>
              <span id="eb-host-count">{touched.value}</span>
            </section>
          </ErrorBoundary>
          <EbEmbeddedFragment />
        </>
      ) : scenario === 'unhandled-rejection' ? (
        <>
          <button
            id="eb-reject"
            onClick$={() => {
              touched.value++;
              Promise.reject(new Error('unhandled boom'));
            }}
          >
            fire-and-forget reject
          </button>
          <span id="eb-reject-touched">{touched.value}</span>
        </>
      ) : (
        <ErrorBoundary fallback$={defaultFallback}>
          <EbContent />
          <EbSyncThrower />
        </ErrorBoundary>
      )}
      <footer id="eb-footer">Footer shell</footer>
    </main>
  );
});
