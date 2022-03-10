import { component$, $, useStore, Slot } from '@builder.io/qwik';

export const SlotParent = component$(() => {
  const state = useStore({
    disableButtons: false,
    disableNested: false,
    removeContent: false,
    count: 0,
  });
  return $(() => {
    return (
      <section class="todoapp">
        <Button state={state}>
          {!state.removeContent && <>DEFAULT {state.count}</>}
          <span q:slot="ignore">IGNORE</span>
        </Button>

        <Button state={state}>
          {!state.removeContent && <div q:slot="start">START {state.count}</div>}
        </Button>

        <Thing state={state}>
          <Button state={state}>{!state.removeContent && <>INSIDE THING {state.count}</>}</Button>
        </Thing>

        <div>
          <button
            class="border border-cyan-600"
            on$:click={() => (state.removeContent = !state.removeContent)}
          >
            Toggle content
          </button>
        </div>
        <div>
          <button
            class="border border-cyan-600"
            on$:click={() => (state.disableButtons = !state.disableButtons)}
          >
            Toggle buttons
          </button>
        </div>
        <div>
          <button
            class="border border-cyan-600"
            on$:click={() => (state.disableNested = !state.disableNested)}
          >
            Toogle Thing
          </button>
        </div>
        <div>
          <button class="border border-cyan-600" on$:click={() => state.count++}>
            Count
          </button>
        </div>
      </section>
    );
  });
});

export const Button = component$((props: { state: any }) => {
  return $(() => {
    return (
      <button class="todoapp">
        <Slot name="start">Placeholder Start</Slot>

        {!props.state.disableButtons && (
          <div>
            <Slot />
          </div>
        )}
        <Slot name="end" />
      </button>
    );
  });
});

export const Thing = component$((props: { state: any }) => {
  return $(() => {
    return <article class="todoapp">{!props.state.disableNested && <Slot />}</article>;
  });
});
