import { component$ } from "@qwik.dev/core";

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
