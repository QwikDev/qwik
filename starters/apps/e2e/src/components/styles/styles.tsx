import {
  component$,
  useStylesScoped$,
  useStore,
  Slot,
  useSignal,
  Fragment,
} from "@builder.io/qwik";
import parent from "./parent.css?inline";
import parent2 from "./parent2.css?inline";
import child from "./child.css?inline";
import child2 from "./child2.css?inline";
import empty from "./empty.css?inline";

export const Styles = component$(() => {
  const reload = useSignal(0);
  return (
    <>
      <button id="reload" data-v={reload.value} onClick$={() => reload.value++}>
        Reload
      </button>
      <StylesChildren v={reload.value} key={reload.value} />
    </>
  );
});

export const StylesChildren = component$<{ v: number }>(({ v }) => {
  useStylesScoped$(parent);
  useStylesScoped$(parent2);

  const store = useStore({
    count: 10,
  });
  return (
    <div class="parent-container">
      <div id="renderCount">Render {v}</div>
      <div class={["parent", `count-${store.count}`]}>
        Parent
        <button id="add-child" type="button" onClick$={() => store.count++}>
          Add Child
        </button>
        {Array.from({ length: store.count }).map((_, i) => (
          <Fragment key={i}>
            <Child index={i} />
            <div class="parent-child">Inline {i}</div>
          </Fragment>
        ))}
      </div>
      <Issue1945 />
      <IssueScopedAndFineGrained />
    </div>
  );
});

export const Child = component$((props: { index: number }) => {
  useStylesScoped$(child);
  useStylesScoped$(child2);
  useStylesScoped$(empty);

  return (
    <div class="child-container">
      <div class="child">Child {props.index}</div>
    </div>
  );
});

export const Issue1945 = component$(() => {
  useStylesScoped$(`h1 {
    background-color: blue;
  }
  `);
  return (
    <>
      <h1 id="issue1945-1">Outside A and B</h1>
      <ComponentA>
        <h1 q:slot="one" id="issue1945-2">
          Outside B
        </h1>
        <ComponentB q:slot="two">
          <h1 id="issue1945-3">Inside B</h1>
        </ComponentB>
        <div q:slot="three">
          <h1 id="issue1945-4">Inside slot 3</h1>
        </div>
        <div q:slot="four">
          {/* This h1 should have a blue background when it is rendered */}
          <h1 id="issue1945-5">Inside slot 4</h1>
        </div>
      </ComponentA>
    </>
  );
});

export const ComponentA = component$(() => {
  useStylesScoped$(`h1 {
    background-color: green;
  }
  `);
  const store = useStore({ show: false });

  return (
    <div>
      {/*
        Slots 1-3 behave as expected, assigning the scopeId of the consuming component to the slotted elements
      */}
      <Slot name="one" />
      <Slot name="two" />
      <Slot name="three" />
      <button id="issue1945-btn" onClick$={() => (store.show = !store.show)}>
        toggle slot 4
      </button>
      {/*
        When Slot 4 is conditionally rendered, the scoped style assigns the wrong
        class to the slotted elements (it assigns ComponentA scopeId instead of
        the scopeId of the consuming component), thus allowing for bleeding scoped
        styles from this component to the slotted elements.
      */}
      {store.show ? <Slot name="four" /> : null}
    </div>
  );
});

export const ComponentB = component$(() => {
  useStylesScoped$(`h1 {
    background-color: red;
  }
  `);
  return (
    <div>
      <Slot />
    </div>
  );
});

export const IssueScopedAndFineGrained = component$(() => {
  useStylesScoped$(`
  .button {
    background-color: red;
  }
  .even {
    background-color: green;
  }
  .odd {
    background-color: blue;
  }
  `);
  const count = useSignal(0);
  return (
    <button
      id="issue-scoped-fine-grained"
      onClick$={() => count.value++}
      class={{
        button: true,
        even: count.value % 2 === 0,
        odd: count.value % 2 === 1,
      }}
    >
      Hello
    </button>
  );
});
