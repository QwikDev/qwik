import { PropsOf, Slot, component$ } from "@qwik.dev/core";

/**
 * @deprecated This component is deprecated and will be removed in future releases.
 */
export const HModalFooter = component$((props: PropsOf<"footer">) => {
  return (
    <footer {...props}>
      <Slot />
    </footer>
  );
});
