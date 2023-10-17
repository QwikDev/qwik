import {
  component$,
  useStore,
  type PropFunction,
  useSignal,
  useOnWindow,
  $,
} from "@builder.io/qwik";

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
    countAnchor: 0,
    showCSR: false,
  });

  return (
    <div>
      <Buttons
        onTransparentClick$={async () => {
          store.countTransparent++;
        }}
        onWrappedClick$={async () => {
          store.countWrapped++;
        }}
      ></Buttons>
      <p>
        <a href="/" preventdefault:click id="prevent-default-1">
          Should prevent default
        </a>
      </p>
      <div>
        <div
          onClick$={() => {
            throw new Error("event was not stopped");
          }}
        >
          <a
            href="/"
            preventdefault:click
            id="prevent-default-2"
            onClick$={(ev) => {
              ev.stopPropagation();
              store.countAnchor++;
            }}
          >
            Should count
          </a>
        </div>
      </div>

      <p id="count-transparent">countTransparent: {store.countTransparent}</p>
      <p id="count-wrapped">countWrapped: {store.countWrapped}</p>
      <p id="count-anchor">countAnchor: {store.countAnchor}</p>
      <Issue3948 />
      <Issue5301 mode="SSR" />
      <button onClick$={() => (store.showCSR = true)}>Issue 5301 CSR</button>
      {store.showCSR && <Issue5301 mode="CSR" />}
    </div>
  );
});

interface ButtonProps {
  onTransparentClick$?: PropFunction<(ev: Event) => any>;
  onWrappedClick$?: PropFunction<(nu: number) => void>;
}

export const Buttons = component$((props: ButtonProps) => {
  const store = useStore({ count: 0 });
  return (
    <div>
      <span>some</span>
      <button id="btn-transparent" onClick$={props.onTransparentClick$ as any}>
        Transparent
      </button>
      <button
        id="btn-wrapped"
        onClick$={async () => {
          store.count++;
          await props.onWrappedClick$?.(store.count);
        }}
      >
        Wrapped {store.count}
      </button>
    </div>
  );
});

export const Listener = component$((props: { name: string }) => {
  const count = useSignal(0);

  useOnWindow(
    "click",
    $(() => {
      count.value++;
    }),
  );

  return (
    <p id={`issue-3948-${props.name}`}>
      {props.name} count: {count.value}
    </p>
  );
});

export const Issue3948 = component$(() => {
  const showingToggle = useSignal(false);

  return (
    <>
      <Listener name="always" />
      <label for="toggle">
        <input
          id="issue-3948-toggle"
          type="checkbox"
          bind:checked={showingToggle}
        />{" "}
        Show conditional
      </label>
      {showingToggle.value && <Listener name="conditional" />}
    </>
  );
});

export const Issue5301 = component$<{ mode: string }>(({ mode }) => {
  const status = useSignal("");
  const ref = useSignal<HTMLElement>();
  return (
    <div class={["issue5301", mode]}>
      <h3>Issue5301: {mode}</h3>
      <span class="status">{status.value}</span>
      <div
        ref={ref}
        onCustom:event_under-dashCamel$={() => (status.value = "WORKED")}
        document:onDOMContentLoaded$={() => (status.value = "DOMContentLoaded")}
      >
        TARGET
      </div>
      <button
        class="test"
        onClick$={() => {
          ref.value!.dispatchEvent(
            new CustomEvent("custom:event_under-dashcamel"),
          );
        }}
      >
        TEST
      </button>
    </div>
  );
});
