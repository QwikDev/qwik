import {
  component$,
  Reveal,
  Suspense,
  useSignal,
  useTask$,
  type JSXOutput,
  type Signal,
} from '@qwik.dev/core';

interface BlockingUpdateProps {
  id: string;
  resolveName: string;
  pendingName: string;
  target?: Signal<number>;
  showButton?: boolean;
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
      <SuspenseChildren key={render.value} />
    </>
  );
});

export const SuspenseChildren = component$(() => {
  return (
    <>
      <SingleBoundary />
      <ShowStaleBoundary />
      <NestedBoundaries />
      <MountedAsyncBoundary />
      <RevealBoundaries />
    </>
  );
});

export const SingleBoundary = component$(() => {
  const resolveName = '__resolveSingleSuspense';
  const pendingName = '__pendingSingleSuspense';

  return (
    <div id="single-boundary">
      <Suspense fallback={<span id="single-fallback">Loading single</span>} delay={10}>
        <BlockingUpdate id="single" resolveName={resolveName} pendingName={pendingName} />
      </Suspense>
      <ResolveUpdate id="single" resolveName={resolveName} />
    </div>
  );
});

export const ShowStaleBoundary = component$(() => {
  const resolveName = '__resolveShowStaleSuspense';
  const pendingName = '__pendingShowStaleSuspense';

  return (
    <div id="show-stale-boundary">
      <Suspense fallback={<span id="show-stale-fallback">Loading stale</span>} delay={10} showStale>
        <BlockingUpdate id="show-stale" resolveName={resolveName} pendingName={pendingName} />
      </Suspense>
      <ResolveUpdate id="show-stale" resolveName={resolveName} />
    </div>
  );
});

export const NestedBoundaries = component$(() => {
  const resolveName = '__resolveInnerSuspense';
  const pendingName = '__pendingInnerSuspense';

  return (
    <div id="nested-boundary">
      <Suspense fallback={<span id="outer-fallback">Loading outer</span>} delay={10}>
        <section id="outer-content">
          <Suspense fallback={<span id="inner-fallback">Loading inner</span>} delay={10}>
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
            fallback={<span id="mounted-async-fallback">Loading mounted async</span>}
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

export const RevealBoundaries = component$(() => {
  const firstResolveName = '__resolveRevealFirstSuspense';
  const firstPendingName = '__pendingRevealFirstSuspense';
  const secondResolveName = '__resolveRevealSecondSuspense';
  const secondPendingName = '__pendingRevealSecondSuspense';
  const firstTarget = useSignal(0);
  const secondTarget = useSignal(0);

  return (
    <div id="reveal-boundary">
      <Reveal order="sequential" collapsed>
        <Suspense
          fallback={<span id="reveal-first-fallback">Loading reveal first</span>}
          delay={10}
        >
          <BlockingUpdate
            id="reveal-first"
            resolveName={firstResolveName}
            pendingName={firstPendingName}
            target={firstTarget}
            showButton={false}
          />
        </Suspense>
        <Suspense
          fallback={<span id="reveal-second-fallback">Loading reveal second</span>}
          delay={10}
        >
          <BlockingUpdate
            id="reveal-second"
            resolveName={secondResolveName}
            pendingName={secondPendingName}
            target={secondTarget}
            showButton={false}
          />
        </Suspense>
      </Reveal>
      <button
        id="reveal-first-button"
        onClick$={() => {
          if ((globalThis as any)[firstPendingName]) {
            return;
          }
          (globalThis as any)[firstPendingName] = true;
          firstTarget.value++;
        }}
      >
        Increment reveal-first
      </button>
      <button
        id="reveal-second-button"
        onClick$={() => {
          if ((globalThis as any)[secondPendingName]) {
            return;
          }
          (globalThis as any)[secondPendingName] = true;
          secondTarget.value++;
        }}
      >
        Increment reveal-second
      </button>
      <ResolveUpdate id="reveal-first" resolveName={firstResolveName} />
      <ResolveUpdate id="reveal-second" resolveName={secondResolveName} />
    </div>
  );
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
  const localTarget = useSignal(0);
  const target = props.target ?? localTarget;
  const value = useSignal(0);

  useTask$(({ track, cleanup }) => {
    const targetValue = track(() => target.value);
    if (targetValue === value.value) {
      return;
    }

    cleanup(() => {
      delete (globalThis as any)[props.resolveName];
      delete (globalThis as any)[props.pendingName];
    });

    return new Promise<void>((resolve) => {
      (globalThis as any)[props.resolveName] = () => {
        delete (globalThis as any)[props.resolveName];
        delete (globalThis as any)[props.pendingName];
        value.value = targetValue;
        resolve();
      };
    });
  });

  return (
    <>
      {props.showButton !== false && (
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
      )}
      <p id={`${props.id}-value`}>value={value.value}</p>
    </>
  );
});
