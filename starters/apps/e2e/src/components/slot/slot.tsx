import { component$, useStore, Slot, Host } from '@builder.io/qwik';

export const SlotParent = component$(() => {
  const state = useStore({
    disableButtons: false,
    disableNested: false,
    removeContent: false,
    count: 0,
  });
  return (
    <section class="todoapp">
      <Button state={state} id="btn1">
        {!state.removeContent && <>DEFAULT {state.count}</>}
        <span q:slot="ignore">IGNORE</span>
      </Button>

      <Button state={state} id="btn2">
        {!state.removeContent && <div q:slot="start">START {state.count}</div>}
      </Button>

      <Thing state={state} id="btn3">
        <Button host:id="projected" state={state}>
          {!state.removeContent && <>INSIDE THING {state.count}</>}
        </Button>
      </Thing>

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
    </section>
  );
});

export const Button = component$((props: { state: any }) => {
  return (
    <Host
      onClick$={() => {
        props.state.count--;
      }}
    >
      <button class="todoapp">
        <Slot name="start">Placeholder Start</Slot>

        {!props.state.disableButtons && (
          <div>
            <Slot />
          </div>
        )}
        <Slot name="end" />
      </button>
    </Host>
  );
});

export const Thing = component$((props: { state: any }) => {
  return <article class="todoapp">{!props.state.disableNested && <Slot />}</article>;
});
