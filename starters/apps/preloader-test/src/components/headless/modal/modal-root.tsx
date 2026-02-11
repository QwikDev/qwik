import {
  PropsOf,
  QRL,
  Signal,
  Slot,
  component$,
  useContextProvider,
  useId,
  useSignal,
} from "@qwik.dev/core";
import { ModalContext, modalContextId } from "./modal-context";

type ModalRootProps = {
  onShow$?: QRL<() => void>;
  onClose$?: QRL<() => void>;
  "bind:show"?: Signal<boolean>;
  closeOnBackdropClick?: boolean;
  alert?: boolean;
} & PropsOf<"div">;

export const HModalRoot = component$((props: ModalRootProps) => {
  const localId = useId();

  const {
    "bind:show": givenShowSig,
    closeOnBackdropClick,
    onShow$,
    onClose$,
    alert,
  } = props;

  const defaultShowSig = useSignal<boolean>(false);
  const showSig = givenShowSig ?? defaultShowSig;

  const context: ModalContext = {
    localId,
    showSig,
    closeOnBackdropClick,
    onShow$,
    onClose$,
    alert,
  };

  useContextProvider(modalContextId, context);

  return (
    <div {...props}>
      <Slot />
    </div>
  );
});
