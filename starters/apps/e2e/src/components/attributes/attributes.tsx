import { component$, useSignal, useStore } from '@builder.io/qwik';

export const Attributes = component$(() => {
  const render = useSignal(0);
  return (
    <>
      <h1>Most of the changes happen in the input attributes</h1>
      <button id="force-rerender" onClick$={() => render.value++}>
        Rerender
      </button>
      <AttributesChild key={render.value} />
    </>
  );
});

export const AttributesChild = component$(() => {
  const renders = useStore(
    {
      count: 0,
    },
    {
      reactive: false,
    }
  );

  const title = useSignal<string>();
  const input = useSignal('');
  const hide = useSignal(false);
  const required = useSignal(false);
  const state = useStore({
    dataAria: 'true',
    count: 0,
    label: 'even',
    stuff: '',
  });
  renders.count++;

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
            title.value = title.value === undefined ? 'some title' : undefined;
          }}
        >
          Toggle title
        </button>
        <button
          id="aria-hidden"
          onClick$={() => {
            state.dataAria = state.dataAria === 'true' ? 'false' : 'true';
          }}
        >
          Toggle aria-hidden
        </button>
        <button
          id="count"
          onClick$={() => {
            state.count++;
            if (state.count % 2 === 0) {
              state.label = 'even';
            } else {
              state.label = 'odd';
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
            state.stuff += '0';
          }}
        >
          Add stuff (caused render)
        </button>
      </div>
      <div>
        Renders: <span id="renders">{renders.count}</span>
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
            <label id="label" for={state.label} form="my-form" title={title.value}></label>
            <input
              id="input"
              required={required.value}
              aria-hidden={state.dataAria as any}
              aria-label={state.label}
              aria-required={required.value}
              draggable={required.value}
              spellcheck={required.value}
              data-stuff={'stuff: ' + state.stuff}
              tabIndex={-1}
              title={title.value}
              onInput$={(ev) => {
                input.value = (ev.target as any).value;
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
    </>
  );
});
