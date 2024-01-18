/* eslint-disable */
import {
  component$,
  useComputed$,
  useSignal,
  useTask$,
} from "@builder.io/qwik";

export const ComputedRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button id="rerender" onClick$={() => rerender.value++}>
        Rerender
      </button>
      <ComputedBasic />
      <Issue3482 />
      <Issue3488 />
      <Issue5738 />
    </div>
  );
});

export const ComputedBasic = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(() => count.value * 2);
  const plus3 = useComputed$(() => double.value + 3);
  const triple = useComputed$(() => plus3.value * 3);
  const sum = useComputed$(() => double.value + plus3.value + triple.value);

  console.log("here");
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
