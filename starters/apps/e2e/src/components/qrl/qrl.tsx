import { $, component$, useComputed$, useSignal } from "@qwik.dev/core";

export const QRL = component$(() => {
  return (
    <>
      <ShouldResolveInnerComputedQRL />
    </>
  );
});

export const ShouldResolveInnerComputedQRL = component$(() => {
  const test = useComputed$(() => 0);
  return <InnerComputedButton test={test} />;
});

export const InnerComputedButton = component$<any>((props) => {
  const syncSelectionCounter = useSignal(0);
  const syncSelection = $(() => {
    syncSelectionCounter.value++;
    props.test.value;
  });

  const handleClick = $(() => syncSelection());

  return (
    <button id="inner-computed-button" onClick$={handleClick}>
      Click Me {syncSelectionCounter.value}
    </button>
  );
});
