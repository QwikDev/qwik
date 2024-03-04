import {
  useStore,
  component$,
  createContextId,
  useContextProvider,
  useContext,
  Slot,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";

export interface ContextI {
  displayName: string;
  count: number;
}

export const Context1 = createContextId<ContextI>("ctx");
export const Context2 = createContextId<ContextI>("ctx1");
export const Context3 = createContextId<ContextI>("ctx2");
export const ContextSlot = createContextId<ContextI>("slot");
export const Unset = createContextId<ContextI>("unset");
export const ContextString = createContextId<string>("ctx-string");

export const ContextRoot = component$(() => {
  const count = useSignal(0);
  return (
    <div>
      <button id="btn-rerender" onClick$={() => count.value++}>
        Client Rerender
      </button>
      <ContextApp key={count.value} />
    </div>
  );
});

export const ContextApp = component$(() => {
  const state1 = useStore({ displayName: "ROOT / state1", count: 0 });
  const state2 = useStore({ displayName: "ROOT / state2", count: 0 });

  useContextProvider(Context1, state1);
  useContextProvider(Context2, state2);

  return (
    <div>
      <button class="root-increment1" onClick$={() => state1.count++}>
        Increment State 1
      </button>
      <button class="root-increment2" onClick$={() => state2.count++}>
        Increment State 2
      </button>

      <ContextFromSlot>
        <Level2 />
        <Level2 />
      </ContextFromSlot>

      <Issue1971 />
      <Issue2087 />
      <Issue2894 />
      <Issue5356 />
      <Issue5793 />
    </div>
  );
});

export const ContextFromSlot = component$(() => {
  const store = useStore({
    displayName: "bar",
    count: 0,
  });
  useContextProvider(ContextSlot, store);
  return <Slot />;
});

// This code will not work because its async before reading subs
export const Level2 = component$(() => {
  const level2State1 = useStore({ displayName: "Level2 / state1", count: 0 });
  // read context1 before changing it
  const state1 = useContext(Context1);
  // change context1
  useContextProvider(Context1, level2State1);

  const state3 = useStore({ displayName: "Level2 / state3", count: 0 });
  useContextProvider(Context3, state3);

  const state2 = useContext(Context2);
  const stateSlot = useContext(ContextSlot);

  return (
    <div>
      <h1>Level2</h1>
      <div class="level2-state1">
        {state1.displayName} = {state1.count}
      </div>
      <div class="level2-state2">
        {state2.displayName} = {state2.count}
      </div>
      <div class="level2-slot">
        {stateSlot.displayName} = {stateSlot.count}
      </div>

      <button class="level2-increment3" onClick$={() => state3.count++}>
        Increment
      </button>

      {Array.from({ length: state3.count }, () => {
        return <Level3></Level3>;
      })}
    </div>
  );
});

export const Level3 = component$(() => {
  const state1 = useContext(Context1);
  const state2 = useContext(Context2);
  const state3 = useContext(Context3);
  const stateSlot = useContext(ContextSlot);

  if (useContext(Unset, null) !== null) {
    throw new Error("ERROR");
  }

  return (
    <div>
      <h2>Level3</h2>
      <div class="level3-state1">
        {state1.displayName} = {state1.count}
      </div>
      <div class="level3-state2">
        {state2.displayName} = {state2.count}
      </div>
      <div class="level3-state3">
        {state3.displayName} = {state3.count}
      </div>
      <div class="level3-slot">
        {stateSlot.displayName} = {stateSlot.count}
      </div>
    </div>
  );
});

export const Issue1971 = component$(() => {
  return (
    <Issue1971Provider>
      <Issue1971Child />
    </Issue1971Provider>
  );
});

export const Issue1971Context = createContextId<any>("issue-1971");

export const Issue1971Provider = component$(() => {
  useContextProvider(Issue1971Context, {
    value: "hello!",
  });

  return <Slot></Slot>;
});

export const Issue1971Child = component$(() => {
  const show = useSignal(false);
  useVisibleTask$(() => {
    show.value = true;
  });
  return (
    <>
      <div>Test 1: {show.value && <Issue1971Consumer />}</div>
    </>
  );
});

export const Issue1971Consumer = component$(() => {
  const ctx = useContext(Issue1971Context);
  return <div id="issue1971-value">Value: {ctx.value}</div>;
});

export const Ctx = createContextId<{ t: string }>("issue-2087");

export const Issue2087 = component$(() => {
  return (
    <>
      <Issue2087_Root />
      <Issue2087_Nested />
    </>
  );
});

export const Issue2087_Root = component$(() => {
  const t = useSignal(0);
  return (
    <Provider>
      <Symbol id="RootA" />
      <button id="issue2087_btn1" onClick$={() => t.value++}>
        Click me
      </button>
      {!!t.value && <Symbol id="RootB" />}
    </Provider>
  );
});

export const Issue2087_Nested = component$(() => {
  const t = useSignal(0);
  return (
    <Provider>
      <Symbol id="NestedA" />
      <button id="issue2087_btn2" onClick$={() => t.value++}>
        Click me
      </button>
      <div>{!!t.value && <Symbol id="NestedB" />}</div>
    </Provider>
  );
});

export const Symbol = component$(({ id }: any) => {
  const s = useContext(Ctx);
  return (
    <p id={`issue2087_symbol_${id}`}>
      Symbol {id}, context value: {s.t}
    </p>
  );
});

export const Provider = component$(() => {
  const s = useStore({ t: "yes" });
  useContextProvider(Ctx, s);
  return <Slot />;
});

export const CTX_2894 = createContextId<{ foo: string }>("issue-2894");
export const Issue2894 = component$(() => {
  useContextProvider(CTX_2894, { foo: "bar" });
  return (
    <>
      <Issue2894_Projector>
        <Issue2894_Consumer />
      </Issue2894_Projector>
    </>
  );
});

export const Issue2894_Projector = component$(() => {
  const signal = useSignal(false);
  if (!signal.value) {
    return (
      <>
        <button id="issue2894-button" onClick$={() => (signal.value = true)}>
          Toggle visibility
        </button>
      </>
    );
  }
  return (
    <>
      <Slot />
    </>
  );
});

export const Issue2894_Consumer = component$(() => {
  const ctx = useContext(CTX_2894);
  return <div id="issue2894-value">Value: {ctx.foo}</div>;
});

export const Issue5356Context = createContextId<object>("issue-5356");
export const Issue5356 = component$(() => {
  useContextProvider(Issue5356Context, {});

  return <Issue5356_Parent />;
});

export const Issue5356_Parent = component$(() => {
  const signal = useSignal(1);

  const children = [1, 2];

  return (
    <div id="issue-5356">
      <button id="issue5356-button-1" onClick$={() => (signal.value = 1)}>
        1
      </button>
      <button id="issue5356-button-2" onClick$={() => (signal.value = 2)}>
        2
      </button>

      <>
        {children.map((value) => (
          <Issue5356_Child
            key={value}
            value={value}
            active={signal.value === value}
          />
        ))}
      </>
      <>
        {[
          <Issue5356_Child value={3} active={signal.value === 1} />,
          <Issue5356_Child value={4} active={signal.value === 2} />,
        ]}
      </>
    </div>
  );
});

export const Issue5356_Child = component$<{ value: number; active: boolean }>(
  (props) => {
    useContext(Issue5356Context);

    return (
      <div id={`issue5356-child-${props.value}`}>
        Child {props.value}, active: {props.active ? "true" : "false"}
      </div>
    );
  },
);

export const Issue5793 = component$(() => {
  useContextProvider(ContextString, "yes");
  return <Issue5793_Child />;
});

export const Issue5793_Child = component$(() => {
  const s = useContext(ContextString);
  return <div id="issue5793-value">{s}</div>;
});
