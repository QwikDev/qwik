import {
  component$,
  isServer,
  Reveal,
  Suspense,
  useServerData,
  useSignal,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';

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

export const OutOfOrderSuspenseRoot = component$(() => {
  const shellCount = useSignal(0);
  const url = useServerData<string>('url');
  const scenario = getSearchParam(url, 'scenario');

  return (
    <main>
      <h1 id="ooos-title">OOOS Suspense</h1>
      {scenario === 'multiple' ? (
        <MultipleOutOfOrderSuspense />
      ) : scenario === 'cross-state' ? (
        <CrossStateOutOfOrderSuspense />
      ) : scenario === 'reveal' ? (
        <RevealOutOfOrderSuspense />
      ) : (
        <Suspense fallback={<FallbackOutOfOrderContent />}>
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
  );
});

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
    if (releaseId) {
      return waitForOutOfOrderRelease(requestId, releaseId, <ResolvedOutOfOrderContent />);
    }
    const params = url ? new URL(url).searchParams : null;
    const delay = Number(params?.get('delay') || 1000);
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<ResolvedOutOfOrderContent />), delay);
    });
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
      <Suspense fallback={<OutOfOrderFallbackPanel id="multi-first" label="First" />}>
        <ControlledOutOfOrderContent id="multi-first" label="First" releaseParam="multiFirst" />
      </Suspense>
      <Suspense fallback={<OutOfOrderFallbackPanel id="multi-second" label="Second" />}>
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
        <Suspense fallback={<OutOfOrderFallbackPanel id="reveal-first" label="Reveal first" />}>
          <ControlledOutOfOrderContent
            id="reveal-first"
            label="Reveal first"
            releaseParam="revealFirst"
          />
        </Suspense>
        <Suspense fallback={<OutOfOrderFallbackPanel id="reveal-second" label="Reveal second" />}>
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
      <Suspense fallback={<CrossStateFallback shared={shared} />}>
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

export const ManualOutOfOrderReleaseButton = component$(
  (props: { id: string; label: string; releaseParam: string }) => {
    const url = useServerData<string>('url');
    const requestId = useServerData<string>('ooosRequestId');
    const releaseId = getSearchParam(url, props.releaseParam);
    if (!releaseId || !requestId) {
      return null;
    }
    const html = `<button id="${escapeAttr(props.id)}" onclick="fetch('/__ooos-release/${encodeURIComponent(
      requestId
    )}/${encodeURIComponent(releaseId)}',{method:'POST'})">${escapeHtml(props.label)}</button>`;

    return <span dangerouslySetInnerHTML={html} />;
  }
);

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
    if (releaseId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <ResolvedOutOfOrderPanel id={props.id} label={props.label} />
      );
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(
        () => resolve(<ResolvedOutOfOrderPanel id={props.id} label={props.label} />),
        1000
      );
    });
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
    if (releaseId) {
      return waitForOutOfOrderRelease(
        requestId,
        releaseId,
        <CrossStateResolved shared={props.shared} />
      );
    }
    return new Promise<JSXOutput>((resolve) => {
      setTimeout(() => resolve(<CrossStateResolved shared={props.shared} />), 1000);
    });
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
