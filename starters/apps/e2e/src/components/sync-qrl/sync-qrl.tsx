import { component$, sync$ } from "@builder.io/qwik";

export const SyncQRL = component$(() => {
  return (
    <div>
      <h1>PreventDefault</h1>
      <input
        id="preventDefaultInput"
        type="checkbox"
        onClick$={[
          sync$((e: Event, target: Element) => {
            if (target.getAttribute("shouldPreventDefault")) {
              e.preventDefault();
            }
            target.setAttribute("prevented", String(e.defaultPrevented));
          }),
        ]}
      />
      <hr />
    </div>
  );
});
