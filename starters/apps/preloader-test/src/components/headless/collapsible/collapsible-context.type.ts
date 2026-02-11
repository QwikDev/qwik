import { type QRL, type Signal } from "@qwik.dev/core";

export interface CollapsibleContext {
  itemId: string;
  isOpenSig: Signal<boolean>;
  triggerRef: Signal<HTMLButtonElement | undefined>;
  contentRef: Signal<HTMLElement | undefined>;
  contentHeightSig: Signal<number | null>;
  getContentDimensions$: QRL<() => void>;
  disabled: boolean | undefined;
  collapsible?: boolean;
}
