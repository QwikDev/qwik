import { component$, useStore, useRef, useClientEffect$, useSignal } from '@builder.io/qwik';

export const RefRoot = component$(() => {
  const state = useStore({
    visible: false,
  });
  useClientEffect$(() => {
    state.visible = true;
  });

  return (
    <>
      <div>
        <Ref id="static" key={'1'}></Ref>
        {state.visible && <Ref id="dynamic" key={'2'}></Ref>}

        <Ref2 id="static-2" key={11}></Ref2>
        {state.visible && <Ref2 id="dynamic-2" key={'22'}></Ref2>}
      </div>
    </>
  );
});

export const Ref = component$((props: { id: string }) => {
  const ref = useRef();
  useClientEffect$(({ track }) => {
    const el = track(() => ref.current);
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
  useClientEffect$(({ track }) => {
    const el = track(() => ref.value);
    el!.textContent = `Rendered ${props.id}`;
  });
  return (
    <>
      <div id={props.id} ref={ref} />
    </>
  );
});
