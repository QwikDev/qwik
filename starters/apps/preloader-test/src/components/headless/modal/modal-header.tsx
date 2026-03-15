import { PropsOf, Slot, component$ } from "@qwik.dev/core";

/**
 * @deprecated This component is deprecated and will be removed in future releases.
 */
export const HModalHeader = component$((props: PropsOf<"header">) => {
  return (
    <header {...props}>
      <Slot />
    </header>
  );
});
