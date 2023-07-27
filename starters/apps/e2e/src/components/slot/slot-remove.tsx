import {
  component$,
  useSignal,
  useContextProvider,
  createContextId,
  type Signal,
  useContext,
  Slot,
} from "@builder.io/qwik";

export const SlotCleanup = component$(() => {
  const rerender = useSignal(0);

  return (
    <section>
      <SlotCleanupChildren key={rerender.value} />
    </section>
  );
});

const CleanupCounterContext = createContextId<Signal<number>>(
  "CleanupCounterContext",
);

export const SlotCleanupChildren = component$(() => {
  const signal = useSignal(0);
  useContextProvider(CleanupCounterContext, signal);

  return (
    <>
      <IssueBogusCleanup />
    </>
  );
});

export const IssueBogusCleanup = component$(() => {
  const signal = useSignal(0);
  useContextProvider(CleanupCounterContext, signal);

  return (
    <>
      <button
        id="issue-2751-toggle"
        onClick$={() => {
          signal.value++;
        }}
      >
        Toggle
      </button>
      <div class="issue-2751-result">
        {signal.value % 2 === 0 ? <CleanupA></CleanupA> : <div>Nothing</div>}
      </div>
    </>
  );
});

interface CleanupProps {
  slot?: boolean;
}
export const CleanupA = component$<CleanupProps>((props) => {
  return (
    <div>
      <Bogus />
      {props.slot && <Slot></Slot>}
    </div>
  );
});

export const Bogus = component$(() => {
  const signal = useContext(CleanupCounterContext);
  const count = signal.value;
  return (
    <div>
      Bogus {count} {signal.value} <span>{signal.value}</span>
    </div>
  );
});
