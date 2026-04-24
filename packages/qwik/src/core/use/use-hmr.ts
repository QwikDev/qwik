import { getDomContainer } from '../client/dom-container';
import { whenVNodeDataReady } from '../client/process-vnode-data';
import {
  _captures,
  deserializeCaptures,
  setCaptures,
  type QRLInternal,
} from '../shared/qrl/qrl-class';
import { inlinedQrl } from '../shared/qrl/qrl';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { tryGetInvokeContext } from './use-core';
import { useOnDocument } from './use-on';
import type { QRL } from '../shared/qrl/qrl.public';

/**
 * HMR event handler. The host VNode is captured at registration time via QRL captures.
 *
 * When called by the qwikloader or the test dispatch, `this` is the serialized captures string
 * which we deserialize to get the host VNode. When called through `_qDispatch` (client-rendered),
 * `_captures` is already set by `ensureQrlCaptures` in the QRL call chain.
 *
 * @internal
 */
export const _hmr = function (
  this: string | undefined,
  event: CustomEvent<{ files: string[]; t: number }>,
  element: Element
) {
  if (
    !event.detail.files.some((file) =>
      element.getAttribute('data-qwik-inspector')?.startsWith(file)
    )
  ) {
    return;
  }
  // Deserialize captures from `this` when called via qwikloader/attribute dispatch
  const container = getDomContainer(element);
  return whenVNodeDataReady(container.document, () => {
    if (typeof this === 'string') {
      setCaptures(deserializeCaptures(container, this));
    }
    const host = _captures![0] as VNode;
    markVNodeDirty(container, host, ChoreBits.COMPONENT);
    // Mark HMR as handled
    const doc: any = element.ownerDocument;
    doc.__hmrDone = doc.__hmrT;
  });
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
  const hostElement = iCtx.$hostElement$;
  // We must capture the vnode to be able to re-render
  const qrl = (hmrQrl as QRLInternal).w([hostElement]) as typeof hmrQrl;
  useOnDocument('qHmr', qrl);
}
