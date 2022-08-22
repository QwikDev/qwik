import { component$, useStore, useRef, useClientEffect$ } from '@builder.io/qwik';

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
        <Ref id="static"></Ref>
        {state.visible && <Ref id="dynamic"></Ref>}
      </div>
    </>
  );
});

export const Ref = component$((props: { id: string }) => {
  const ref = useRef();
  useClientEffect$(() => {
    ref.current!.textContent = 'Rendered';
  });
  return (
    <>
      <div id={props.id} ref={ref} />
    </>
  );
});
