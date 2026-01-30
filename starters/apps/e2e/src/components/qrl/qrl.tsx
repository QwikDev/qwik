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
    // Access the computed to ensure it resolves without errors
    props.test.value;
  });

  const handleClick = $(() => {
    // Note, we call the qrl without awaiting it to simulate real world usage
    // The only way to avoid uncaught promise errors is to ensure the computed qrl is resolved beforehand
    syncSelection();
  });

  return (
    <button id="inner-computed-button" onClick$={handleClick}>
      Click Me {syncSelectionCounter.value}
    </button>
  );
});
