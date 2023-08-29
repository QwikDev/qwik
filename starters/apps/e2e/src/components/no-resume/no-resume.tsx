import { component$ } from "@builder.io/qwik";

export const NoResume = component$(() => {
  return (
    <button
      onClick$={() => {
        document.body.style.background = "black";
      }}
    >
      Click me
    </button>
  );
});
