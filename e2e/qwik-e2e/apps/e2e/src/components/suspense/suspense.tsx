import { component$, Suspense, useSignal, useTask$ } from '@qwik.dev/core';

interface BlockingUpdateProps {
  id: string;
  resolveName: string;
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
      <NestedBoundaries />
    </>
  );
});

export const SingleBoundary = component$(() => {
  return (
    <div id="single-boundary">
      <Suspense fallback={<span id="single-fallback">Loading single</span>} timeout={10}>
        <BlockingUpdate id="single" resolveName="__resolveSingleSuspense" />
      </Suspense>
    </div>
  );
});

export const NestedBoundaries = component$(() => {
  return (
    <div id="nested-boundary">
      <Suspense fallback={<span id="outer-fallback">Loading outer</span>} timeout={10}>
        <section id="outer-content">
          <Suspense fallback={<span id="inner-fallback">Loading inner</span>} timeout={10}>
            <BlockingUpdate id="inner" resolveName="__resolveInnerSuspense" />
          </Suspense>
        </section>
      </Suspense>
    </div>
  );
});

export const BlockingUpdate = component$((props: BlockingUpdateProps) => {
  const value = useSignal(0);

  useTask$(({ track }) => {
    const trackedValue = track(() => value.value);
    if (trackedValue === 0) {
      return;
    }

    return new Promise<void>((resolve) => {
      (globalThis as any)[props.resolveName] = () => {
        delete (globalThis as any)[props.resolveName];
        resolve();
      };
    });
  });

  return (
    <>
      <button id={`${props.id}-button`} onClick$={() => value.value++}>
        Increment {props.id}
      </button>
      <p id={`${props.id}-value`}>value={value.value}</p>
    </>
  );
});
