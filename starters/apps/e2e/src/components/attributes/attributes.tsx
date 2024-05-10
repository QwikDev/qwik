import { component$, useSignal, useStore } from "@builder.io/qwik";

export const Attributes = component$(() => {
  const render = useSignal(0);
  return (
    <>
      <h1>Most of the changes happen in the input attributes</h1>
      <button
        id="force-rerender"
        data-v={render.value}
        onClick$={() => render.value++}
      >
        Rerender
      </button>
      <AttributesChild v={render.value} key={render.value} />
    </>
  );
});

export const AttributesChild = component$<{ v: number }>(({ v }) => {
  const renders = useStore(
    {
      count: 0,
    },
    {
      reactive: false,
    },
  );

  const title = useSignal<string>();
  const input = useSignal("");
  const hide = useSignal(false);
  const required = useSignal(false);
  const state = useStore({
    dataAria: "true",
    count: 0,
    label: "even",
    stuff: "",
  });
  renders.count++;
  const rerenders = renders.count + 0;

  console.warn(state.stuff);
  return (
    <>
      <div>
        <button
          id="hide"
          onClick$={() => {
            hide.value = !hide.value;
          }}
        >
          Toggle hide
        </button>
        <button
          id="title"
          onClick$={() => {
            title.value = title.value === undefined ? "some title" : undefined;
          }}
        >
          Toggle title
        </button>
        <button
          id="aria-hidden"
          onClick$={() => {
            state.dataAria = state.dataAria === "true" ? "false" : "true";
          }}
        >
          Toggle aria-hidden
        </button>
        <button
          id="count"
          onClick$={() => {
            state.count++;
            if (state.count % 2 === 0) {
              state.label = "even";
            } else {
              state.label = "odd";
            }
          }}
        >
          Count
        </button>
        <button
          id="required"
          onClick$={() => {
            required.value = !required.value;
          }}
        >
          Toggle required
        </button>
        <button
          id="stuff"
          onClick$={() => {
            state.stuff += "0";
          }}
        >
          Add stuff (caused render)
        </button>
      </div>
      <div>
        Renders: <span id="renders">{rerenders}</span>
      </div>
      <div>
        {hide.value ? (
          <>
            <label id="label" />
            <input id="input" />
            <svg id="svg">
              <feGaussianBlur></feGaussianBlur>
              <foreignObject>
                <foreignObject></foreignObject>
                <div>Still outside svg</div>
              </foreignObject>
              <textPath></textPath>
            </svg>
          </>
        ) : (
          <>
            <label
              id="label"
              for={state.label}
              form="my-form"
              title={title.value}
            ></label>
            <input
              id="input"
              required={required.value}
              aria-hidden={state.dataAria as any}
              aria-label={state.label}
              aria-required={required.value}
              draggable={required.value}
              spellcheck={required.value}
              data-stuff={"stuff: " + state.stuff}
              tabIndex={-1}
              title={title.value}
              onInput$={(ev, el) => {
                input.value = el.value;
              }}
            />
            <svg
              id="svg"
              width="15"
              height="15"
              class="is-svg"
              preserveAspectRatio="xMidYMin slice"
              aria-hidden={state.dataAria as any}
            >
              <feGaussianBlur class="is-svg"></feGaussianBlur>
              <foreignObject class="is-svg">
                <foreignObject class="is-html"></foreignObject>
                <div class="is-html">Still outside svg</div>
              </foreignObject>
              <textPath scale={0.1}></textPath>
            </svg>
          </>
        )}
      </div>
      <div id="input-value">{input.value}</div>
      <input id="input-copy" value={input.value} />
      <Issue3622 />
      <Issue4718Null />
      <Issue4718Undefined />
      <div id="renderCount">Render {v}</div>
    </>
  );
});

export const Issue3622 = component$(() => {
  return (
    <div>
      <select id="issue-3622-result" value="option1">
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
      </select>
    </div>
  );
});

export const Issue4718Undefined = component$(() => {
  const signal = useSignal<string | undefined>("some value");

  return (
    <button
      id="issue-4718-undefined-result"
      data-works={signal.value}
      aria-label={signal.value}
      title={signal.value}
      class={!signal.value && "moop"}
      onClick$={() => {
        signal.value = undefined;
      }}
    >
      Click Me
    </button>
  );
});

export const Issue4718Null = component$(() => {
  const signal = useSignal<string | null>("some value");

  return (
    <button
      id="issue-4718-null-result"
      data-works={signal.value as any}
      aria-label={signal.value as any}
      title={signal.value as any}
      class={!signal.value && "moop"}
      onClick$={() => {
        signal.value = null;
      }}
    >
      Click Me
    </button>
  );
});
