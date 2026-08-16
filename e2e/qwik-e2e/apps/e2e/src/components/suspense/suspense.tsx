import {
  component$,
  isServer,
  Reveal,
  Suspense,
  untrack,
  useServerData,
  useSignal,
  useTask$,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';

interface BlockingUpdateProps {
  id: string;
  resolveName: string;
  pendingName: string;
}

export const SuspenseRoot = component$(() => {
  const render = useSignal(0);

  return (
    <>
      <h1>Suspense</h1>
      <button id="force-rerender" data-v={render.value} onClick$={() => render.value++}>
        Rerender
      </button>
      <span id="render-count">{render.value}</span>
      {render.value % 2 ? <SuspenseChildren /> : <SuspenseChildren />}
    </>
  );
});

export const SuspenseChildren = component$(() => {
  return (
    <>
      <SingleBoundary />
      <NestedBoundaries />
      <MountedAsyncBoundary />
    </>
  );
});

export const SingleBoundary = component$(() => {
  const resolveName = '__resolveSingleSuspense';
  const pendingName = '__pendingSingleSuspense';

  return (
    <div id="single-boundary">
      <Suspense fallback$={() => <span id="single-fallback">Loading single</span>} delay={10}>
        <BlockingUpdate id="single" resolveName={resolveName} pendingName={pendingName} />
      </Suspense>
      <ResolveUpdate id="single" resolveName={resolveName} />
    </div>
  );
});

export const NestedBoundaries = component$(() => {
  const resolveName = '__resolveInnerSuspense';
  const pendingName = '__pendingInnerSuspense';

  return (
    <div id="nested-boundary">
      <Suspense fallback$={() => <span id="outer-fallback">Loading outer</span>} delay={10}>
        <section id="outer-content">
          <Suspense fallback$={() => <span id="inner-fallback">Loading inner</span>} delay={10}>
            <BlockingUpdate id="inner" resolveName={resolveName} pendingName={pendingName} />
          </Suspense>
        </section>
      </Suspense>
      <ResolveUpdate id="inner" resolveName={resolveName} />
    </div>
  );
});

export const MountedAsyncBoundary = component$(() => {
  const show = useSignal(false);
  const resolveName = '__resolveMountedAsyncSuspense';

  return (
    <div id="mounted-async-boundary">
      <button id="mounted-async-button" onClick$={() => (show.value = true)}>
        Mount async suspense
      </button>
      {show.value && (
        <>
          <Suspense
            fallback$={() => <span id="mounted-async-fallback">Loading mounted async</span>}
            delay={10}
          >
            <MountedAsyncChild resolveName={resolveName} />
          </Suspense>
          <ResolveUpdate id="mounted-async" resolveName={resolveName} />
        </>
      )}
    </div>
  );
});

export const MountedAsyncChild = component$((props: { resolveName: string }) => {
  const content = new Promise<JSXOutput>((resolve) => {
    (globalThis as any)[props.resolveName] = () => {
      delete (globalThis as any)[props.resolveName];
      resolve(<p id="mounted-async-value">Async content</p>);
    };
  });
  return <>{content}</>;
});

export const ResolveUpdate = component$((props: { id: string; resolveName: string }) => {
  return (
    <button
      id={`${props.id}-resolve`}
      onClick$={() => {
        const resolve = (globalThis as any)[props.resolveName];
        if (typeof resolve === 'function') {
          resolve();
        }
      }}
    >
      Resolve {props.id}
    </button>
  );
});

export const BlockingUpdate = component$((props: BlockingUpdateProps) => {
  const target = useSignal(0);
  const value = useSignal(0);

  useTask$(({ cleanup }) => {
    const targetValue = target.value;
    if (targetValue === untrack(() => value.value)) {
      return;
    }

    const [resolveName, pendingName] = untrack(
      () => [props.resolveName, props.pendingName] as const
    );

    cleanup(() => {
      delete (globalThis as any)[resolveName];
      delete (globalThis as any)[pendingName];
    });

    return new Promise<void>((resolve) => {
      (globalThis as any)[resolveName] = () => {
        delete (globalThis as any)[resolveName];
        delete (globalThis as any)[pendingName];
        value.value = targetValue;
        resolve();
      };
    });
  });

  return (
    <>
      <button
        id={`${props.id}-button`}
        onClick$={() => {
          if ((globalThis as any)[props.pendingName]) {
            return;
          }
          (globalThis as any)[props.pendingName] = true;
          target.value++;
        }}
      >
        Increment {props.id}
      </button>
      <p id={`${props.id}-value`}>value={value.value}</p>
    </>
  );
});

// import { SSRRaw, SSRStream, type SSRStreamWriter } from '@qwik.dev/core/internal';

type OutOfOrderReleaseStore = {
  resolved: Set<string>;
  resolvers: Map<string, Set<() => void>>;
};

const getOutOfOrderReleaseStore = (): OutOfOrderReleaseStore =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

const getOutOfOrderReleaseKey = (requestId: string, releaseId: string): string => {
  return `${requestId}:${releaseId}`;
};

const getSearchParam = (url: string | undefined, name: string): string | null => {
  return url ? new URL(url).searchParams.get(name) : null;
};

const waitForOutOfOrderRelease = (
  requestId: string,
  releaseId: string,
  value: JSXOutput
): Promise<JSXOutput> => {
  return new Promise<JSXOutput>((resolve) => {
    const release = () => resolve(value);
    const store = getOutOfOrderReleaseStore();
    const key = getOutOfOrderReleaseKey(requestId, releaseId);
    if (store.resolved.has(key)) {
      release();
    } else {
      let resolvers = store.resolvers.get(key);
      if (!resolvers) {
        store.resolvers.set(key, (resolvers = new Set()));
      }
      resolvers.add(release);
    }
  });
};

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (value: string): string =>
  escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// WebKit buffers streamed HTML until enough early body content is emitted.
// https://bugs.webkit.org/show_bug.cgi?id=265386
const WEBKIT_STREAMING_FLUSH = '\u200b'.repeat(512);

export const OutOfOrderSuspenseRoot = component$(() => {
  const shellCount = useSignal(0);
  const render = useSignal(0);
  const url = useServerData<string>('url');
  const scenario = getSearchParam(url, 'scenario');
  const webkitFlush = getSearchParam(url, 'webkitFlush') === '1';

  return (
    <>
      {webkitFlush ? (
        <div aria-hidden="true" style="width:0px;height:0px;overflow:hidden">
          {WEBKIT_STREAMING_FLUSH}
        </div>
      ) : null}
      <main>
        <h1 id="ooos-title">OOOS Suspense</h1>
        <button id="ooos-force-rerender" data-v={render.value} onClick$={() => render.value++}>
          Rerender
        </button>
        <span id="ooos-render-count">{render.value}</span>
        {scenario === 'multiple' ? (
          <MultipleOutOfOrderSuspense />
        ) : scenario === 'cross-state' ? (
          <CrossStateOutOfOrderSuspense />
        ) : scenario === 'delay' ? (
          <DelayedFallbackOutOfOrderSuspense />
        ) : scenario === 'reveal' ? (
          <RevealOutOfOrderSuspense />
        ) : // ) : scenario === 'containers' ? (
        //   <OutOfOrderSuspenseContainers />
        // ) : scenario === 'container' ? (
        //   <OutOfOrderSuspenseContainerFragment />
        scenario === 'rerender' ? (
          <OutOfOrderSuspenseRerender />
        ) : render.value % 2 ? (
          <Suspense fallback$={() => <FallbackOutOfOrderContent />}>
            <SlowOutOfOrderContent />
          </Suspense>
        ) : (
          <Suspense fallback$={() => <FallbackOutOfOrderContent />}>
            <SlowOutOfOrderContent />
          </Suspense>
        )}
        <ManualOutOfOrderReleaseButton
          id="ooos-default-release"
          label="Resolve default suspense"
          releaseParam="release"
        />
        <button id="ooos-shell-button" onClick$={() => shellCount.value++}>
          Touch shell
        </button>
        <span id="ooos-shell-count">{shellCount.value}</span>
        <footer id="ooos-footer">Footer shell</footer>
      </main>
    </>
  );
});

/* TODO(v3): restore SSRStream coverage when the API returns.
const SSRStreamOutOfOrderContainer = component$<{
  id: string;
  releaseId: string | null;
}>(({ id, releaseId }) => {
  const decoder = new TextDecoder();
  const getSSRStreamFunction = (remoteUrl: string) => async (stream: SSRStreamWriter) => {
    const response = await fetch(`http://localhost:${(globalThis as any).PORT}${remoteUrl}`, {
      headers: {
        accept: 'text/html',
      },
    });
    if (response.ok) {
      const reader = response.body!.getReader();
      let fragmentChunk = await reader.read();
      while (!fragmentChunk.done) {
        stream.write((<SSRRaw data={decoder.decode(fragmentChunk.value)} />) as string);
        fragmentChunk = await reader.read();
      }
    } else {
      console.error('Failed to connect with status:', response.status, response.statusText);
    }
  };
  const params = new URLSearchParams({
    fragment: '',
    loader: 'false',
    scenario: 'container',
    id,
  });
  if (releaseId) {
    params.set('release', releaseId);
  }

  return (
    <section id={`ooos-${id}-stream`}>
      <SSRStream>{getSSRStreamFunction(`/e2e/suspense-ooos?${params}`)}</SSRStream>
    </section>
  );
});

export const OutOfOrderSuspenseContainers = component$(() => {
  const url = useServerData<string>('url');
  const firstReleaseId = getSearchParam(url, 'first');
  const secondReleaseId = getSearchParam(url, 'second');

  return (
    <section id="ooos-containers">
      <SSRStreamOutOfOrderContainer id="container-first" releaseId={firstReleaseId} />
      <SSRStreamOutOfOrderContainer id="container-second" releaseId={secondReleaseId} />
    </section>
  );
});

export const OutOfOrderSuspenseContainerFragment = component$(() => {
  const url = useServerData<string>('url');
  const id = getSearchParam(url, 'id') || 'container';
  const label = id.replace(/-/g, ' ');

  return (
    <section id={`ooos-${id}-root`}>
      <Suspense fallback$={() => <OutOfOrderFallbackPanel id={id} label={label} />}>
        <ControlledOutOfOrderContent id={id} label={label} releaseParam="release" />
      </Suspense>
      <ManualOutOfOrderReleaseButton
        id={`ooos-${id}-release`}
        label={`Resolve ${label}`}
        releaseParam="release"
      />
    </section>
  );
});
*/

export const FallbackOutOfOrderContent = component$(() => {
  const count = useSignal(0);

  return (
    <section id="ooos-fallback">
      <p>Loading streamed content</p>
      <button id="ooos-fallback-button" onClick$={() => count.value++}>
        Touch fallback
      </button>
      <span id="ooos-fallback-count">{count.value}</span>
    </section>
  );
});

export const SlowOutOfOrderContent = component$(() => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, 'release');
    if (releaseId && requestId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <ResolvedOutOfOrderContent />
      ) as unknown as JSXOutput;
    }
    const params = url ? new URL(url).searchParams : null;
    const delay = Number(params?.get('delay') || 1000);
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<ResolvedOutOfOrderContent />), delay);
    }) as unknown as JSXOutput;
  }
  return <ResolvedOutOfOrderContent />;
});

export const ResolvedOutOfOrderContent = component$(() => {
  const count = useSignal(0);

  return (
    <section id="ooos-resolved">
      <p>Resolved streamed content</p>
      <button id="ooos-resolved-button" onClick$={() => count.value++}>
        Touch resolved
      </button>
      <span id="ooos-resolved-count">{count.value}</span>
    </section>
  );
});

export const MultipleOutOfOrderSuspense = component$(() => {
  return (
    <section id="ooos-multiple">
      <Suspense fallback$={() => <OutOfOrderFallbackPanel id="multi-first" label="First" />}>
        <ControlledOutOfOrderContent id="multi-first" label="First" releaseParam="multiFirst" />
      </Suspense>
      <Suspense fallback$={() => <OutOfOrderFallbackPanel id="multi-second" label="Second" />}>
        <ControlledOutOfOrderContent id="multi-second" label="Second" releaseParam="multiSecond" />
      </Suspense>
      <ManualOutOfOrderReleaseButton
        id="ooos-multi-first-release"
        label="Resolve first suspense"
        releaseParam="multiFirst"
      />
      <ManualOutOfOrderReleaseButton
        id="ooos-multi-second-release"
        label="Resolve second suspense"
        releaseParam="multiSecond"
      />
    </section>
  );
});

export const RevealOutOfOrderSuspense = component$(() => {
  return (
    <section id="ooos-reveal">
      <Reveal order="sequential" collapsed>
        <Suspense
          fallback$={() => <OutOfOrderFallbackPanel id="reveal-first" label="Reveal first" />}
        >
          <ControlledOutOfOrderContent
            id="reveal-first"
            label="Reveal first"
            releaseParam="revealFirst"
          />
        </Suspense>
        <Suspense
          fallback$={() => <OutOfOrderFallbackPanel id="reveal-second" label="Reveal second" />}
        >
          <ControlledOutOfOrderContent
            id="reveal-second"
            label="Reveal second"
            releaseParam="revealSecond"
          />
        </Suspense>
      </Reveal>
      <ManualOutOfOrderReleaseButton
        id="ooos-reveal-first-release"
        label="Resolve first reveal suspense"
        releaseParam="revealFirst"
      />
      <ManualOutOfOrderReleaseButton
        id="ooos-reveal-second-release"
        label="Resolve second reveal suspense"
        releaseParam="revealSecond"
      />
    </section>
  );
});

export const CrossStateOutOfOrderSuspense = component$(() => {
  const shared = useSignal(0);

  return (
    <section id="ooos-cross">
      <button id="ooos-cross-shell-button" onClick$={() => shared.value++}>
        Touch cross shell
      </button>
      <p id="ooos-cross-shell-count">shared={shared.value}</p>
      <Suspense fallback$={() => <CrossStateFallback shared={shared} />}>
        <CrossStateContent shared={shared} />
      </Suspense>
      <ManualOutOfOrderReleaseButton
        id="ooos-cross-release"
        label="Resolve cross-state suspense"
        releaseParam="cross"
      />
    </section>
  );
});

export const DelayedFallbackOutOfOrderSuspense = component$(() => {
  const url = useServerData<string>('url');
  const fallbackDelay = Number(getSearchParam(url, 'fallbackDelay') || 1000);

  return (
    <section id="ooos-delay-root">
      <Suspense
        fallback$={() => <OutOfOrderFallbackPanel id="delay" label="Delay" />}
        delay={fallbackDelay}
      >
        <ControlledOutOfOrderContent id="delay" label="Delay" releaseParam="delayRelease" />
      </Suspense>
      <ManualOutOfOrderReleaseButton
        id="ooos-delay-release"
        label="Resolve delay suspense"
        releaseParam="delayRelease"
      />
    </section>
  );
});

export const OutOfOrderSuspenseRerender = component$(() => {
  const render = useSignal(0);

  return (
    <section id="ooos-rerender-root">
      <button id="ooos-rerender-button" onClick$={() => render.value++}>
        Rerender keyed suspense
      </button>
      <span id="ooos-rerender-count">{render.value}</span>
      {render.value % 2 ? (
        <KeyedOutOfOrderSuspense value={render.value} />
      ) : (
        <KeyedOutOfOrderSuspense value={render.value} />
      )}
      <ManualOutOfOrderReleaseButton
        id="ooos-rerender-release"
        label="Resolve rerender suspense"
        releaseParam="rerender"
      />
    </section>
  );
});

export const KeyedOutOfOrderSuspense = component$((props: { value: number }) => {
  return (
    <section id="ooos-rerender-keyed" data-value={props.value}>
      <Suspense fallback$={() => <OutOfOrderFallbackPanel id="rerender" label="Rerender" />}>
        <RerenderOutOfOrderContent value={props.value} />
      </Suspense>
    </section>
  );
});

export const ManualOutOfOrderReleaseButton = component$(
  (props: { id: string; label: string; releaseParam: string }) => {
    const url = useServerData<string>('url');
    const requestId = useServerData<string>('ooosRequestId');
    const releaseId = getSearchParam(url, props.releaseParam);
    if (!releaseId || !requestId) {
      return null;
    }
    const releaseUrl = `/__ooos-release/${encodeURIComponent(requestId)}/${encodeURIComponent(
      releaseId
    )}`;
    const html = `<button id="${escapeAttr(props.id)}" data-release-url="${escapeAttr(
      releaseUrl
    )}" onclick="fetch(this.getAttribute('data-release-url'),{method:'POST'})">${escapeHtml(
      props.label
    )}</button>`;

    return <span dangerouslySetInnerHTML={html} />;
  }
);

export const RerenderOutOfOrderContent = component$((props: { value: number }) => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, 'rerender');
    if (releaseId && requestId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <RerenderOutOfOrderPanel value={props.value} />
      ) as unknown as JSXOutput;
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<RerenderOutOfOrderPanel value={props.value} />), 1000);
    }) as unknown as JSXOutput;
  }
  return <RerenderOutOfOrderPanel value={props.value} />;
});

export const RerenderOutOfOrderPanel = component$((props: { value: number }) => {
  const count = useSignal(0);

  return (
    <section id="ooos-rerender-resolved">
      <p id="ooos-rerender-resolved-label">Resolved rerender {props.value}</p>
      <button id="ooos-rerender-resolved-button" onClick$={() => count.value++}>
        Touch rerender resolved
      </button>
      <span id="ooos-rerender-resolved-count">{count.value}</span>
    </section>
  );
});

type ControlledOutOfOrderContentProps = {
  id: string;
  label: string;
  releaseParam: string;
};

export const ControlledOutOfOrderContent = component$<ControlledOutOfOrderContentProps>((props) => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, props.releaseParam);
    if (releaseId && requestId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <ResolvedOutOfOrderPanel id={props.id} label={props.label} />
      ) as unknown as JSXOutput;
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(
        () => resolve(<ResolvedOutOfOrderPanel id={props.id} label={props.label} />),
        1000
      );
    }) as unknown as JSXOutput;
  }
  return <ResolvedOutOfOrderPanel id={props.id} label={props.label} />;
});

export const OutOfOrderFallbackPanel = component$((props: { id: string; label: string }) => {
  const count = useSignal(0);

  return (
    <section id={`ooos-${props.id}-fallback`}>
      <p>{props.label} fallback</p>
      <button id={`ooos-${props.id}-fallback-button`} onClick$={() => count.value++}>
        Touch {props.label} fallback
      </button>
      <span id={`ooos-${props.id}-fallback-count`}>{count.value}</span>
    </section>
  );
});

export const ResolvedOutOfOrderPanel = component$((props: { id: string; label: string }) => {
  const count = useSignal(0);

  return (
    <section id={`ooos-${props.id}-resolved`}>
      <p>{props.label} resolved</p>
      <button id={`ooos-${props.id}-resolved-button`} onClick$={() => count.value++}>
        Touch {props.label} resolved
      </button>
      <span id={`ooos-${props.id}-resolved-count`}>{count.value}</span>
    </section>
  );
});

export const CrossStateFallback = component$((props: { shared: Signal<number> }) => {
  return (
    <section id="ooos-cross-fallback">
      <p id="ooos-cross-fallback-count">shared={props.shared.value}</p>
      <button id="ooos-cross-fallback-button" onClick$={() => props.shared.value++}>
        Touch cross fallback
      </button>
    </section>
  );
});

export const CrossStateContent = component$<{ shared: Signal<number> }>((props) => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('ooosRequestId');
  if (isServer) {
    const releaseId = getSearchParam(url, 'cross');
    if (releaseId && requestId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <CrossStateResolved shared={props.shared} />
      ) as unknown as JSXOutput;
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<CrossStateResolved shared={props.shared} />), 1000);
    }) as unknown as JSXOutput;
  }
  return <CrossStateResolved shared={props.shared} />;
});

export const CrossStateResolved = component$((props: { shared: Signal<number> }) => {
  return (
    <section id="ooos-cross-resolved">
      <p id="ooos-cross-resolved-count">shared={props.shared.value}</p>
      <button id="ooos-cross-resolved-button" onClick$={() => props.shared.value++}>
        Touch cross resolved
      </button>
    </section>
  );
});
