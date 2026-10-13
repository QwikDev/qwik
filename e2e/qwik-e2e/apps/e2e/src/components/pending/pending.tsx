import { component$, Pending, useSignal, useTask$, type JSXOutput } from '@qwik.dev/core';

interface BlockingUpdateProps {
  id: string;
  resolveName: string;
  pendingName: string;
}

export const PendingRoot = component$(() => {
  const render = useSignal(0);

  return (
    <>
      <h1>Pending</h1>
      <button id="force-rerender" data-v={render.value} onClick$={() => render.value++}>
        Rerender
      </button>
      <span id="render-count">{render.value}</span>
      <PendingChildren key={render.value} />
    </>
  );
});

export const PendingChildren = component$(() => {
  return (
    <>
      <SingleBoundary />
      <NestedBoundaries />
      <MountedAsyncBoundary />
    </>
  );
});

export const SingleBoundary = component$(() => {
  const resolveName = '__resolveSingleBoundary';
  const pendingName = '__pendingSingleBoundary';

  return (
    <div id="single-boundary">
      <Pending fallback$={() => <span id="single-fallback">Loading single</span>} delay={10}>
        <BlockingUpdate id="single" resolveName={resolveName} pendingName={pendingName} />
      </Pending>
      <ResolveUpdate id="single" resolveName={resolveName} />
    </div>
  );
});

export const NestedBoundaries = component$(() => {
  const resolveName = '__resolveInnerBoundary';
  const pendingName = '__pendingInnerBoundary';

  return (
    <div id="nested-boundary">
      <Pending fallback$={() => <span id="outer-fallback">Loading outer</span>} delay={10}>
        <section id="outer-content">
          <Pending fallback$={() => <span id="inner-fallback">Loading inner</span>} delay={10}>
            <BlockingUpdate id="inner" resolveName={resolveName} pendingName={pendingName} />
          </Pending>
        </section>
      </Pending>
      <ResolveUpdate id="inner" resolveName={resolveName} />
    </div>
  );
});

export const MountedAsyncBoundary = component$(() => {
  const show = useSignal(false);
  const resolveName = '__resolveMountedAsyncBoundary';

  return (
    <div id="mounted-async-boundary">
      <button id="mounted-async-button" onClick$={() => (show.value = true)}>
        Mount async boundary
      </button>
      {show.value && (
        <>
          <Pending
            fallback$={() => <span id="mounted-async-fallback">Loading mounted async</span>}
            delay={10}
          >
            <MountedAsyncChild resolveName={resolveName} />
          </Pending>
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
