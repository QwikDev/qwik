import { inlinedQrl } from '../shared/qrl/qrl';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { OnRenderFn } from '../shared/component.public';
import { newInvokeContextFromDOM, tryGetInvokeContext } from './use-core';
import { useOnDocument } from './use-on';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { OnRenderProp } from '../shared/utils/markers';
import type { VNode } from '../shared/vnode/vnode';
import type { QRL } from '../shared/qrl/qrl.public';

/**
 * HMR event handler. Replaces the component QRL with a fresh one and marks dirty.
 *
 * @internal
 */
export const _hmr = (event: Event, element: Element) => {
  const ctx = newInvokeContextFromDOM(event, element);
  const container = ctx.$container$;
  let host = ctx.$hostElement$;
  if (!container || !host) {
    return;
  }
  // host is a VNode from vnode_locate. Walk up to the nearest component VirtualVNode
  // (the one with OnRenderProp) so we can replace its QRL and mark it dirty.
  if (!container.getHostProp(host, OnRenderProp)) {
    const parent = container.getParentHost(host);
    if (!parent) {
      return;
    }
    host = parent;
  }
  // Replace the component QRL with a fresh one to bypass caching
  // Maybe we should use a qrl registry to invalidate all QRLs from a parent?
  const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp);
  if (qrl) {
    const lazy = qrl.$lazy$;
    const chunk = lazy.$chunk$!;
    if (chunk) {
      /**
       * Bust the cache by appending a timestamp to the chunk URL. There's some chance that we
       * import the same chunk multiple times, but that's not really a problem for segments.
       */
      const bustUrl = chunk.split('?')[0] + '?t=' + Date.now();
      (lazy as any).$chunk$ = bustUrl;
      lazy.$ref$ = undefined;
      qrl.resolved = undefined;
      // Force rerender
      markVNodeDirty(container, host as VNode, ChoreBits.COMPONENT);
    }
  }
};

/** Sanitize path to a valid CSS-safe event name (no colons, dots, slashes). */
const toEventName = (devPath: string) => 'qHmr' + devPath.replace(/[^a-zA-Z0-9_]/g, '_');
let hmrQrl: QRL<(event: Event, element: Element) => void>;
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
  useOnDocument(toEventName(devPath), hmrQrl);
}
