import { component$, Suspense, untrack, useAsync$, useSignal, useTask$ } from '@qwik.dev/core';

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
  // the signal lives outside the suspending child, so the mount retry re-reads it once settled;
  // it computes lazily on the child's first read, registering the resolver only after mounting
  const content = useAsync$(
    () =>
      new Promise<string>((resolve) => {
        (globalThis as any).__resolveMountedAsyncSuspense = () => {
          delete (globalThis as any).__resolveMountedAsyncSuspense;
          resolve('Async content');
        };
      })
  );

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
            <MountedAsyncChild content={content} />
          </Suspense>
          <ResolveUpdate id="mounted-async" resolveName="__resolveMountedAsyncSuspense" />
        </>
      )}
    </div>
  );
});

export const MountedAsyncChild = component$((props: { content: { value: string } }) => {
  // the body read suspends the mount until the async value settles
  const value = props.content.value;
  return <p id="mounted-async-value">{value}</p>;
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
