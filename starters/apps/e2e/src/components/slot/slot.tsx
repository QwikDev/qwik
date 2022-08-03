import { component$, useStore, Slot, Host } from '@builder.io/qwik';

export const SlotParent = component$(() => {
  const state = useStore({
    disableButtons: false,
    disableNested: false,
    removeContent: false,
    render: true,
    count: 0,
  });
  return (
    <section class="todoapp">
      {state.render && (
        <>
          <Projector state={state} id="btn1">
            {!state.removeContent && <>DEFAULT {state.count}</>}
            <span q:slot="ignore">IGNORE</span>
          </Projector>

          <Projector state={state} id="btn2">
            {!state.removeContent && <div q:slot="start">START {state.count}</div>}
          </Projector>

          <Thing state={state} id="btn3">
            <Projector host:id="projected" state={state}>
              {!state.removeContent && <>INSIDE THING {state.count}</>}
            </Projector>
          </Thing>
        </>
      )}
      <div>
        <button
          id="btn-toggle-content"
          class="border border-cyan-600"
          onClick$={() => (state.removeContent = !state.removeContent)}
        >
          Toggle content
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-buttons"
          class="border border-cyan-600"
          onClick$={() => (state.disableButtons = !state.disableButtons)}
        >
          Toggle buttons
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-thing"
          class="border border-cyan-600"
          onClick$={() => (state.disableNested = !state.disableNested)}
        >
          Toogle Thing
        </button>
      </div>
      <div>
        <button id="btn-count" class="border border-cyan-600" onClick$={() => state.count++}>
          Count
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-render"
          class="border border-cyan-600"
          onClick$={() => (state.render = !state.render)}
        >
          Toogle render
        </button>
      </div>
    </section>
  );
});

export const Projector = component$((props: { state: any }) => {
  return (
    <Host
      onClick$={() => {
        props.state.count--;
      }}
    >
      <Button>
        <Slot name="start">Placeholder Start</Slot>

        {!props.state.disableButtons && (
          <div>
            <Slot as="article" />
          </div>
        )}
        <Slot name="end" />
      </Button>
    </Host>
  );
});

export const Button = component$(
  () => {
    return <Host q:sname="" type="button"></Host>;
  },
  {
    tagName: 'button',
  }
);

export const Thing = component$((props: { state: any }) => {
  return <article class="todoapp">{!props.state.disableNested && <Slot />}</article>;
});
