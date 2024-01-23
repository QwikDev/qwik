import {
  component$,
  useStore,
  useVisibleTask$,
  useSignal,
  type PropsOf,
} from "@builder.io/qwik";

export const RefRoot = component$(() => {
  const state = useStore({
    visible: false,
  });
  useVisibleTask$(() => {
    state.visible = true;
  });

  return (
    <>
      <div>
        <Ref id="static" key={"1"}></Ref>
        {state.visible && <Ref id="dynamic" key={"2"}></Ref>}

        <Ref2 id="static-2" key={11}></Ref2>
        {state.visible && <Ref2 id="dynamic-2" key={"22"}></Ref2>}

        <Ref3 id="static-3" key={111}></Ref3>
        {state.visible && <Ref3 id="dynamic-3" key={"33"}></Ref3>}
      </div>
    </>
  );
});

export const Ref = component$((props: { id: string }) => {
  const ref = useSignal<Element>();
  useVisibleTask$(({ track }) => {
    const el = track(() => ref.value);
    el!.textContent = `Rendered ${props.id}`;
  });
  return (
    <>
      <div id={props.id} ref={ref} />
    </>
  );
});

export const Ref2 = component$((props: { id: string }) => {
  const ref = useSignal<Element>();
  useVisibleTask$(({ track }) => {
    const el = track(() => ref.value);
    el!.textContent = `Rendered ${props.id}`;
  });
  return (
    <>
      <div id={props.id} ref={ref} />
    </>
  );
});

export const Ref3 = component$(
  <C extends "div" | "span">(
    props: { as?: C } & PropsOf<unknown extends C ? "div" : C>,
  ) => {
    const { as = "div", ...rest } = props;
    const ref = useSignal<HTMLElement>();

    const Cmp = as as any;

    useVisibleTask$(() => {
      ref.value!.textContent = `Rendered ${props.id}`;
    });

    return (
      <>
        <Cmp {...rest} ref={ref}>
          Test
        </Cmp>
      </>
    );
  },
);
