import {
  $,
  component$,
  useComputed$,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";

export const QRL = component$(() => {
  const render = useSignal(0);
  return (
    <>
      <button id="rerender" onClick$={() => render.value++}>
        rerender {render.value}
      </button>
      <div key={render.value}>
        <ShouldResolveComputedQRL />
        <ShouldResolveInnerComputedQRL />
      </div>
    </>
  );
});

export const ShouldResolveComputedQRL = component$(() => {
  const computedCounter = useSignal(0);
  const text = useComputed$(() => {
    computedCounter.value++;
    return "";
  });

  return (
    <>
      <span id="computed-counter">{computedCounter.value}</span>
      <Test text={text} />
    </>
  );
});

export const Test = component$<any>(({ text }) => {
  const visibleCounter = useSignal(0);
  useVisibleTask$(async () => {
    visibleCounter.value++;
    text.value;
  });

  return <div id="visible-counter">{visibleCounter.value}</div>;
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

  const handleClick = $(() => {
    syncSelection();
  });

  return (
    <button id="inner-computed-button" onClick$={handleClick}>
      Click Me {syncSelectionCounter.value}
    </button>
  );
});
