import { component$, useSignal } from "@qwik.dev/core";

export const NoResume = component$(() => {
  const sig = useSignal(0);
  return (
    <>
      <div>This turns red on resume</div>
      <button
        document:onQResume$={() => {
          // this should not crash
          void sig.value;
          document.body.style.color = "red";
        }}
        onClick$={() => {
          document.body.style.background = "black";
        }}
        onDblClick$={() => {
          sig.value++;
        }}
      >
        Click me {sig.value}
      </button>
    </>
  );
});
