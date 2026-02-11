import { PropsOf, Slot, component$, useContext } from "@qwik.dev/core";
import { modalContextId } from "./modal-context";

export type ModalDescriptionProps = PropsOf<"p">;

export const HModalDescription = component$((props: ModalDescriptionProps) => {
  const context = useContext(modalContextId);

  const descriptionId = `${context.localId}-description`;

  return (
    <p id={descriptionId} {...props}>
      <Slot />
    </p>
  );
});
