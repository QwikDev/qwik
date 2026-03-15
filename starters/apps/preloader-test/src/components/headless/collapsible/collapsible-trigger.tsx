import {
  $,
  PropsOf,
  Slot,
  component$,
  useContext,
  useOnWindow,
} from "@qwik.dev/core";
import { collapsibleContextId } from "./collapsible-context";

export const HCollapsibleTrigger = component$<PropsOf<"button">>(
  ({ onClick$, ...props }) => {
    const context = useContext(collapsibleContextId);
    const contentId = `${context.itemId}-content`;
    const triggerId = `${context.itemId}-trigger`;

    const handleClick$ = $(async () => {
      if (context.isOpenSig.value && context.collapsible === false) {
        return;
      }
      context.isOpenSig.value = !context.isOpenSig.value;
    });

    useOnWindow("resize", context.getContentDimensions$);

    return (
      <button
        {...props}
        id={triggerId}
        ref={context.triggerRef}
        disabled={context.disabled}
        data-disabled={context.disabled ? "" : undefined}
        aria-disabled={context.disabled ? "true" : "false"}
        data-open={context.isOpenSig.value ? "" : undefined}
        data-closed={!context.isOpenSig.value ? "" : undefined}
        aria-expanded={context.isOpenSig.value}
        aria-controls={contentId}
        onClick$={[handleClick$, onClick$]}
      >
        <Slot />
      </button>
    );
  },
);
