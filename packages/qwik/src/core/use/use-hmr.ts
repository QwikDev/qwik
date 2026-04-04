import { inlinedQrl } from '../shared/qrl/qrl';
import type { QRL } from '../shared/qrl/qrl.public';
import { OnRenderProp } from '../shared/utils/markers';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { newInvokeContextFromDOM, tryGetInvokeContext } from './use-core';
import { useOnDocument } from './use-on';

/**
 * HMR event handler. Replaces the component QRL with a fresh one and marks dirty.
 *
 * @internal
 */
export const _hmr = (event: CustomEvent<{ files: string[]; t: number }>, element: Element) => {
  if (
    !event.detail.files.some((file) =>
      element.getAttribute('data-qwik-inspector')?.startsWith(file)
    )
  ) {
    // This is an HMR event, but it doesn't match the file of this component. Ignore it.
    return;
  }
  const ctx = newInvokeContextFromDOM(event, element);
  const container = ctx.$container$;
  let host = ctx.$hostElement$;
  if (!container || !host) {
    return;
  }
  // host is a VNode from vnode_locate. Walk up to the nearest component
  // (the one with OnRenderProp) so we can replace its QRL and mark it dirty.
  if (!container.getHostProp(host, OnRenderProp)) {
    const parent = container.getParentHost(host);
    if (!parent) {
      return;
    }
    host = parent;
  }
  // Force rerender, QRLs are refetched in qrl-class.ts during this tick
  markVNodeDirty(container, host as VNode, ChoreBits.COMPONENT);
  // Mark HMR as handled
  (document as any).__hmrDone = (document as any).__hmrT;
};

let hmrQrl: QRL<(event: CustomEvent, element: Element) => void>;
/**
 * Injected by the optimizer into component$ bodies in HMR mode. Registers a document event listener
 * that triggers component re-render on HMR updates.
 *
 * @internal
 */
export function _useHmr(devPath: string): void {
  const iCtx = tryGetInvokeContext();
  if (!iCtx) {
    return;
  }
  hmrQrl ||= inlinedQrl(_hmr, '_hmr');
  // The event name must be CSS-attribute-safe (no colons, dots) because
  // the qwikloader uses querySelectorAll('[q-d\\:eventName]') to find handlers.
  useOnDocument('qHmr', hmrQrl);
}
