import {
  component$,
  createContextId,
  type Signal,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useTask$,
} from '@qwik.dev/core';

export const CTXCount = createContextId<Signal<number>>('resuming-count');
export const CTXShow = createContextId<Signal<boolean>>('resuming-show');
export const CTXCounterCopy = createContextId<Signal<number>>('resuming-copy');

export const Resuming1 = component$(() => {
  const signal = useSignal(0);
  useContextProvider(CTXCount, signal);
  const signalCopy = useSignal(0);
  useContextProvider(CTXCounterCopy, signalCopy);

  return (
    <>
      <div>
        <Resuming2 />
      </div>
      <ResumingStoredComponent />
    </>
  );
});

export const Resuming2 = component$(() => {
  const show = useSignal(true);
  const count = useContext(CTXCounterCopy);

  return (
    <>
      <div>
        <button id="toggle" onClick$={() => (show.value = !show.value)}>
          Toggle
        </button>
        <ResumingCounterButton />
        <div id="counter-copy">{count.value}</div>
        {show.value && <ResumingCounterShow />}
      </div>
    </>
  );
});

export const ResumingCounterShow = component$(() => {
  const count = useContext(CTXCount);
  const copy = useContext(CTXCounterCopy);

  useTask$(({ track }) => {
    const value = track(() => count.value);
    copy.value = value;
  });
  return (
    <>
      <div id="counter">{count.value + ''}</div>
    </>
  );
});

export const ResumingCounterButton = component$(() => {
  const count = useContext(CTXCount);

  return (
    <>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </>
  );
});

export const Hello = component$(() => <p id="stored-hello">hello from Hello</p>);

export const ResumingStoredComponent = component$(() => {
  const registry = useStore({ first: Hello, second: Hello });
  const shown = useSignal<typeof Hello | null>(null);

  return (
    <>
      <button id="show-stored" onClick$={() => (shown.value = registry.second)}>
        Show stored
      </button>
      {shown.value && <shown.value />}
    </>
  );
});
