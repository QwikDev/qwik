import type { DocumentHead } from "@qwik.dev/router";
import { component$, useSignal } from "@qwik.dev/core";
import { MUIButton, MUISlider, TableApp } from "~/integrations/react/mui";

export default component$(() => {
  const show = useSignal(false);
  const count = useSignal(0);
  const variant = useSignal<"contained" | "outlined" | "text">("contained");

  return (
    <>
      <h1>Qwik/React mother of all demos</h1>
      <select
        value={variant.value}
        onChange$={(ev) => {
          variant.value = (ev.target as any).value;
        }}
      >
        <option>text</option>
        <option>outlined</option>
        <option selected>contained</option>
      </select>

      <MUISlider
        value={count.value}
        onChange$={(_, value) => {
          count.value = value as number;
        }}
      />

      <MUIButton variant={variant.value} host:onClick$={() => alert("click")}>
        Slider is {count.value}
      </MUIButton>

      <button onClick$={() => (show.value = true)}>Show table</button>
      {show.value && (
        <TableApp client:visible>Slider is {count.value}</TableApp>
      )}
    </>
  );
});

export const head: DocumentHead = {
  title: "Qwik React",
};
