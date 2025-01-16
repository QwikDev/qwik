import {
  component$,
  useStore,
  type QRL,
  useSignal,
  useOnWindow,
  $,
} from "@builder.io/qwik";

export const Events = component$(() => {
  const store = useStore({
    countTransparent: 0,
    countWrapped: 0,
    countAnchor: 0,
    propagationStoppedCount: 0,
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
        <div
          onClick$={() => {
            store.propagationStoppedCount++;
            throw new Error("event was not stopped");
          }}
        >
          <button
            stoppropagation:click
            id="stop-propagation"
            onClick$={(ev) => {
              store.propagationStoppedCount++;
            }}
          >
            Should stop propagation{" "}
          </button>
        </div>
      </div>
      <p id="count-transparent">countTransparent: {store.countTransparent}</p>
      <p id="count-wrapped">countWrapped: {store.countWrapped}</p>
      <p id="count-anchor">countAnchor: {store.countAnchor}</p>
      <p id="count-propagation">
        countPropagationStopped: {store.propagationStoppedCount}
      </p>
      <Issue3948 />
    </div>
  );
});

interface ButtonProps {
  onTransparentClick$?: QRL<(ev: Event) => any>;
  onWrappedClick$?: QRL<(nu: number) => void>;
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
