import { getDomContainer, whenContainerDataReady } from '../client/dom-container';
import {
  _captures,
  deserializeCaptureDeltas,
  setCaptures,
  type QRLInternal,
} from '../shared/qrl/qrl-class';
import { inlinedQrl } from '../shared/qrl/qrl';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { Container } from '../shared/types';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { VNodeFlags } from '../client/types';
import { tryGetInvokeContext } from './use-core';
import { useOnDocument } from './use-on';
import type { QRL } from '../shared/qrl/qrl.public';
import { isHmrPathForFile } from '../shared/utils/hmr';
import { ELEMENT_SEQ } from '../shared/utils/markers';
import { isTask, TaskFlags } from './use-task';

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
  const files = event.detail.files;
  const inspectorPath = element.getAttribute('data-qwik-inspector');
  const container = getDomContainer(element);
  return whenContainerDataReady(container, () => {
    if (typeof this === 'string') {
      setCaptures(deserializeCaptureDeltas(container, this));
    }
    const devPath = _captures?.[1] as string | undefined;
    const hmrPath = devPath ?? inspectorPath;
    if (!hmrPath || !files.some((file) => isHmrPathForFile(hmrPath, file))) {
      return;
    }
    const host = _captures?.[0] as VNode | undefined;
    if (!host || host.flags & VNodeFlags.Deleted) {
      return;
    }
    markVNodeDirty(container, host, ChoreBits.COMPONENT);
    reRunChangedTasks(container, host, files);
  });
};

function reRunChangedTasks(container: Container, host: VNode, files: string[]): void {
  const elementSeq = container.getHostProp<unknown[] | null>(host, ELEMENT_SEQ);
  if (!elementSeq) {
    return;
  }
  let hasChangedTask = false;
  for (let i = 0; i < elementSeq.length; i++) {
    const item = elementSeq[i];
    if (!isTask(item)) {
      continue;
    }
    const taskFile = item.$qrl$.dev?.file ?? item.$qrl$.$chunk$;
    if (taskFile && files.some((file) => isHmrPathForFile(taskFile, file))) {
      item.$flags$ |= TaskFlags.DIRTY | TaskFlags.REMOUNT_ON_THROW;
      hasChangedTask = true;
    }
  }
  if (hasChangedTask) {
    markVNodeDirty(container, host, ChoreBits.TASKS);
  }
}

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
  const qrl = (hmrQrl as QRLInternal).w([hostElement, devPath]) as typeof hmrQrl;
  useOnDocument('qHmr', qrl);
}
