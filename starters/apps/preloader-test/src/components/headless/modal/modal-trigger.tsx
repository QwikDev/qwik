import { PropsOf, Slot, component$, useContext, $ } from "@qwik.dev/core";
import { modalContextId } from "./modal-context";

export const HModalTrigger = component$((props: PropsOf<"button">) => {
  const context = useContext(modalContextId);

  const handleClick$ = $(() => {
    context.showSig.value = !context.showSig.value;
  });

  return (
    <button
      aria-haspopup="dialog"
      aria-expanded={context.showSig.value}
      data-open={context.showSig.value ? "" : undefined}
      data-closed={!context.showSig.value ? "" : undefined}
      onClick$={[handleClick$, props.onClick$]}
      {...props}
    >
      <Slot />
    </button>
  );
});
