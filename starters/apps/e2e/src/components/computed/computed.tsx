import { component$, useComputed$, useSignal, useTask$ } from "@qwik.dev/core";

export const ComputedRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button id="rerender" onClick$={() => rerender.value++}>
        Rerender
      </button>
      <span id="render-count">Renders: {rerender.value}</span>
      <ComputedBasic />
      <Issue3482 />
      <Issue3488 />
      <Issue5738 />
      <ShouldHandleMultipleComputeds />
      <ShouldResolveComputedQrlEarly />
      <ShouldRetryWhenThereIsNoQRL />
    </div>
  );
});

export const ComputedBasic = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(() => count.value * 2);
  const plus3 = useComputed$(() => double.value + 3);
  const triple = useComputed$(() => plus3.value * 3);
  const sum = useComputed$(() => double.value + plus3.value + triple.value);

  return (
    <div>
      <div class="result">count: {count.value}</div>
      <div class="result">double: {double.value}</div>
      <div class="result">plus3: {plus3.value}</div>
      <div class="result">triple: {triple.value}</div>
      <div class="result">sum: {sum.value + ""}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});

export const Issue3482 = component$((props) => {
  const count = useSignal(0);

  const attributes = useComputed$(() => {
    return {
      "data-nu": String(count.value),
      class: `class-${count.value}`,
    };
  });

  return (
    <>
      <button id="issue-3482-button" onClick$={() => count.value++}>
        Increment
      </button>
      <div id="issue-3482-div" {...attributes.value}>
        Div
      </div>
      <TextContent {...attributes.value}></TextContent>
    </>
  );
});

export const TextContent = component$(
  (props: { "data-nu"?: string; class?: string }) => {
    return (
      <div>
        <div id="issue-3482-datanu">data-nu: {props["data-nu"]}</div>
        <div id="issue-3482-class">class: {props.class}</div>
      </div>
    );
  },
);

export const Issue3488 = component$(() => {
  const count = useSignal(0);

  const data = useComputed$(() => {
    return {
      class: `class-${count.value}`,
    };
  });

  return (
    <>
      <button id="issue-3488-button" onClick$={() => count.value++}>
        Increment
      </button>
      <div id="issue-3488-result">{data.value.class}</div>
    </>
  );
});

export const Issue5738 = component$(() => {
  const foo = useSignal(0);
  const comp = useComputed$(() => {
    return foo.value * 2;
  });
  useTask$(() => {
    foo.value = 1;
  });
  return <div id="issue-5738-result">Calc: {comp.value}</div>;
});

export const ShouldResolveComputedQrlEarly = component$(() => {
  const trigger = useSignal(0);
  const display = useSignal("not clicked yet");

  const demo = useComputed$(() => "Hello");

  // change attribute and read computed
  useTask$(({ track }) => {
    if (!track(trigger)) {
      return;
    }

    // We don't immediately read the computed, but we do deserialize it from lexical scope, which should resolve it early.
    setTimeout(
      () => {
        try {
          display.value = demo.value + " world";
        } catch {
          // happens when we read another computed value that wasn't loaded yet
          display.value = "computed not ready yet";
        }
      },
      // give enough time for the computed to resolve
      100,
    );
  });

  return (
    <>
      <button id="early-computed-qrl" onClick$={() => trigger.value++}>
        Click me! {display.value}
      </button>
    </>
  );
});

export const ShouldHandleMultipleComputeds = component$(() => {
  const isToggled = useSignal<boolean>(false);

  const demo = useComputed$(() => 3);

  // change attribute and read computed
  const repro = useComputed$(() => {
    if (!isToggled.value) {
      return;
    }

    // happens when we read another computed value
    return demo.value + 2;
  });

  return (
    <>
      <button
        id="multiple-computed-qrl"
        // also when tied to an attribute
        data-test={repro.value}
        onClick$={() => (isToggled.value = !isToggled.value)}
      >
        Click me! {repro.value}
      </button>
    </>
  );
});

export const ShouldRetryWhenThereIsNoQRL = component$(() => {
  const counter = useSignal(0);

  const someComputed = useComputed$(() => {});

  return (
    <button
      id="retry-no-qrl"
      onClick$={() => {
        someComputed.value;
        counter.value++;
      }}
    >
      {counter.value}
    </button>
  );
});
