import { $, component$, useSignal } from '@qwik.dev/core';

export const EventsClient = component$(() => {
  const enabled = useSignal(false);
  const input = useSignal('');
  const bindEnabled = useSignal(false);
  const boundInput = useSignal('');
  const inputBeforeBind = useSignal('');

  return (
    <div>
      <p>
        <a id="link" href="/" preventdefault:click onClick$={() => {}}>
          Should not navigate
        </a>
        <input
          id="input"
          onInput$={
            enabled.value
              ? $((ev, el) => {
                  input.value = el.value;
                })
              : undefined
          }
          onFocus$={() => {
            enabled.value = true;
          }}
        />

        {enabled.value && <EventChildren input={input.value}></EventChildren>}
      </p>
      <p>
        <input
          id="input-with-bind"
          onInput$={
            bindEnabled.value
              ? $((_event, element) => {
                  inputBeforeBind.value = `${boundInput.value}->${element.value}`;
                })
              : undefined
          }
          onFocus$={() => {
            bindEnabled.value = true;
          }}
          bind:value={boundInput}
        />
        <span id="input-with-bind-result">
          Enabled: {String(bindEnabled.value)}; Dynamic: {inputBeforeBind.value}; Bound:{' '}
          {boundInput.value}
        </span>
      </p>
    </div>
  );
});

export const EventChildren = component$((props: { input: string }) => {
  const isOver = useSignal(false);
  return (
    <div
      id="div"
      class={{ isOver: isOver.value }}
      onClick$={undefined}
      onMouseOver$={() => {
        isOver.value = true;
      }}
    >
      Text: {props.input}
    </div>
  );
});
