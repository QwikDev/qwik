import { PropsOf, Slot, component$ } from "@qwik.dev/core";

/**
 * @deprecated This component is deprecated and will be removed in future releases.
 */
export const HModalContent = component$((props: PropsOf<"div">) => {
  return (
    <div {...props}>
      <Slot />
    </div>
  );
});
