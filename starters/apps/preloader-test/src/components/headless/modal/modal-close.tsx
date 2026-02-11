import { PropsOf, Slot, component$, useContext, $ } from "@qwik.dev/core";
import { modalContextId } from "./modal-context";

export const HModalClose = component$((props: PropsOf<"button">) => {
  const context = useContext(modalContextId);

  const handleClick$ = $(() => {
    context.showSig.value = false;
  });

  return (
    <button type="button" onClick$={[handleClick$, props.onClick$]} {...props}>
      <Slot />
    </button>
  );
});
