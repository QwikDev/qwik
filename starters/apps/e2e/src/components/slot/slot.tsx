import { component$, useStore, Slot } from '@builder.io/qwik';

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
          <Issue1630>
            <Child id="slot-child" q:slot="slot-content">
              Component Slot Content
            </Child>
            <p q:slot="slot-content" id="slot-p">
              P Slot Content
            </p>
            <p id="noslot-p">Non-Slotted Content</p>
          </Issue1630>
          <Issue1410>
            <span id="modal-content">Model content</span>
          </Issue1410>
          <Projector state={state} id="btn1">
            {!state.removeContent && <>DEFAULT {state.count}</>}
            <span q:slot="ignore">IGNORE</span>
          </Projector>

          <Projector state={state} id="btn2">
            {!state.removeContent && <div q:slot="start">START {state.count}</div>}
          </Projector>

          <Thing state={state} id="btn3">
            <Projector id="projected" state={state}>
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

export const Issue1630 = component$(() => {
  const store = useStore({ open: true });

  return (
    <>
      <button id="toggle-child-slot" onClick$={() => (store.open = !store.open)}>
        Toggle Non-Slotted Content
      </button>
      <Slot name="slot-content" />
      {store.open && <Slot />}
    </>
  );
});

export const Child = component$((props: { id?: string }) => {
  return (
    <p id={props.id}>
      <Slot />
    </p>
  );
});

export const Issue1410 = component$(() => {
  const store = useStore({ open: true });

  return (
    <>
      <button id="toggle-modal" onClick$={() => (store.open = !store.open)}>
        Toggle modal
      </button>
      {store.open && (
        <>
          <Child>
            <Slot />
          </Child>
        </>
      )}
    </>
  );
});

export const Projector = component$((props: { state: any; id: string }) => {
  return (
    <div
      id={props.id}
      onClick$={() => {
        props.state.count--;
      }}
    >
      <Button>
        <Slot name="start"></Slot>

        {!props.state.disableButtons && (
          <div>
            <Slot />
          </div>
        )}
        <Slot name="end" />
      </Button>
    </div>
  );
});

export const Button = component$((props: { id?: string }) => {
  return (
    <button type="button" id={props.id}>
      <Slot />
    </button>
  );
});

export const Thing = component$((props: { state: any; id: string }) => {
  return (
    <article class="todoapp" id={props.id}>
      {!props.state.disableNested && <Slot />}
    </article>
  );
});
