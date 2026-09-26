import {
  component$,
  isServer,
  Reveal,
  Pending,
  useServerData,
  useSignal,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';
import { SSRRaw, SSRStream, type SSRStreamWriter } from '@qwik.dev/core/internal';
import { waitForRelease } from '../../../../../utils/release-gate';
import { WEBKIT_STREAMING_FLUSH } from '../../../../../utils/webkit-flush';

const getSearchParam = (url: string | undefined, name: string): string | null => {
  return url ? new URL(url).searchParams.get(name) : null;
};

const waitForOutOfOrderRelease = (
  requestId: string,
  releaseId: string,
  value: JSXOutput
): Promise<JSXOutput> => waitForRelease(requestId, releaseId).then(() => value);

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (value: string): string =>
  escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const OutOfOrderPendingRoot = component$(() => {
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
        <h1 id="ooos-title">OOOS Pending</h1>
        <button id="ooos-force-rerender" data-v={render.value} onClick$={() => render.value++}>
          Rerender
        </button>
        <span id="ooos-render-count">{render.value}</span>
        {scenario === 'multiple' ? (
          <MultipleOutOfOrderPending />
        ) : scenario === 'cross-state' ? (
          <CrossStateOutOfOrderPending />
        ) : scenario === 'delay' ? (
          <DelayedFallbackOutOfOrderPending />
        ) : scenario === 'reveal' ? (
          <RevealOutOfOrderPending />
        ) : scenario === 'containers' ? (
          <OutOfOrderPendingContainers />
        ) : scenario === 'container' ? (
          <OutOfOrderPendingContainerFragment />
        ) : scenario === 'rerender' ? (
          <OutOfOrderPendingRerender />
        ) : (
          <Pending key={render.value} fallback$={() => <FallbackOutOfOrderContent />}>
            <SlowOutOfOrderContent />
          </Pending>
        )}
        <ManualOutOfOrderReleaseButton
          id="ooos-default-release"
          label="Resolve default boundary"
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
      <SSRStream>{getSSRStreamFunction(`/e2e/pending-ooos?${params}`)}</SSRStream>
    </section>
  );
});

export const OutOfOrderPendingContainers = component$(() => {
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

export const OutOfOrderPendingContainerFragment = component$(() => {
  const url = useServerData<string>('url');
  const id = getSearchParam(url, 'id') || 'container';
  const label = id.replace(/-/g, ' ');

  return (
    <section id={`ooos-${id}-root`}>
      <Pending fallback$={() => <OutOfOrderFallbackPanel id={id} label={label} />}>
        <ControlledOutOfOrderContent id={id} label={label} releaseParam="release" />
      </Pending>
      <ManualOutOfOrderReleaseButton
        id={`ooos-${id}-release`}
        label={`Resolve ${label}`}
        releaseParam="release"
      />
    </section>
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

export const MultipleOutOfOrderPending = component$(() => {
  return (
    <section id="ooos-multiple">
      <Pending fallback$={() => <OutOfOrderFallbackPanel id="multi-first" label="First" />}>
        <ControlledOutOfOrderContent id="multi-first" label="First" releaseParam="multiFirst" />
      </Pending>
      <Pending fallback$={() => <OutOfOrderFallbackPanel id="multi-second" label="Second" />}>
        <ControlledOutOfOrderContent id="multi-second" label="Second" releaseParam="multiSecond" />
      </Pending>
      <ManualOutOfOrderReleaseButton
        id="ooos-multi-first-release"
        label="Resolve first boundary"
        releaseParam="multiFirst"
      />
      <ManualOutOfOrderReleaseButton
        id="ooos-multi-second-release"
        label="Resolve second boundary"
        releaseParam="multiSecond"
      />
    </section>
  );
});

export const RevealOutOfOrderPending = component$(() => {
  return (
    <section id="ooos-reveal">
      <Reveal order="sequential" collapsed>
        <Pending
          fallback$={() => <OutOfOrderFallbackPanel id="reveal-first" label="Reveal first" />}
        >
          <ControlledOutOfOrderContent
            id="reveal-first"
            label="Reveal first"
            releaseParam="revealFirst"
          />
        </Pending>
        <Pending
          fallback$={() => <OutOfOrderFallbackPanel id="reveal-second" label="Reveal second" />}
        >
          <ControlledOutOfOrderContent
            id="reveal-second"
            label="Reveal second"
            releaseParam="revealSecond"
          />
        </Pending>
      </Reveal>
      <ManualOutOfOrderReleaseButton
        id="ooos-reveal-first-release"
        label="Resolve first reveal boundary"
        releaseParam="revealFirst"
      />
      <ManualOutOfOrderReleaseButton
        id="ooos-reveal-second-release"
        label="Resolve second reveal boundary"
        releaseParam="revealSecond"
      />
    </section>
  );
});

export const CrossStateOutOfOrderPending = component$(() => {
  const shared = useSignal(0);

  return (
    <section id="ooos-cross">
      <button id="ooos-cross-shell-button" onClick$={() => shared.value++}>
        Touch cross shell
      </button>
      <p id="ooos-cross-shell-count">shared={shared.value}</p>
      <Pending fallback$={() => <CrossStateFallback shared={shared} />}>
        <CrossStateContent shared={shared} />
      </Pending>
      <ManualOutOfOrderReleaseButton
        id="ooos-cross-release"
        label="Resolve cross-state boundary"
        releaseParam="cross"
      />
    </section>
  );
});

export const DelayedFallbackOutOfOrderPending = component$(() => {
  const url = useServerData<string>('url');
  const fallbackDelay = Number(getSearchParam(url, 'fallbackDelay') || 1000);

  return (
    <section id="ooos-delay-root">
      <Pending
        fallback$={() => <OutOfOrderFallbackPanel id="delay" label="Delay" />}
        delay={fallbackDelay}
      >
        <ControlledOutOfOrderContent id="delay" label="Delay" releaseParam="delayRelease" />
      </Pending>
      <ManualOutOfOrderReleaseButton
        id="ooos-delay-release"
        label="Resolve delay boundary"
        releaseParam="delayRelease"
      />
    </section>
  );
});

export const OutOfOrderPendingRerender = component$(() => {
  const render = useSignal(0);

  return (
    <section id="ooos-rerender-root">
      <button id="ooos-rerender-button" onClick$={() => render.value++}>
        Rerender keyed boundary
      </button>
      <span id="ooos-rerender-count">{render.value}</span>
      <KeyedOutOfOrderPending key={render.value} value={render.value} />
      <ManualOutOfOrderReleaseButton
        id="ooos-rerender-release"
        label="Resolve rerender boundary"
        releaseParam="rerender"
      />
    </section>
  );
});

export const KeyedOutOfOrderPending = component$((props: { value: number }) => {
  return (
    <section id="ooos-rerender-keyed" data-value={props.value}>
      <Pending fallback$={() => <OutOfOrderFallbackPanel id="rerender" label="Rerender" />}>
        <RerenderOutOfOrderContent value={props.value} />
      </Pending>
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
