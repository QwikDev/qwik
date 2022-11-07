import {
  component$,
  useSignal,
  useContextProvider,
  createContext,
  Signal,
  useContext,
  useWatch$,
} from '@builder.io/qwik';

export const CTXCount = createContext<Signal<number>>('resuming-count');
export const CTXShow = createContext<Signal<boolean>>('resuming-show');
export const CTXCounterCopy = createContext<Signal<number>>('resuming-copy');

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

  useWatch$(({ track }) => {
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
