import { component$, useSignal, $ } from "@builder.io/qwik";

export const EventsClient = component$(() => {
  const enabled = useSignal(false);
  const input = useSignal("");

  return (
    <div>
      <p>
        <a id="link" href="/" preventdefault:click>
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
