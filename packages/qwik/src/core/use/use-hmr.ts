import { getDomContainer, whenContainerDataReady } from '../client/dom-container';
import { type ClientContainer, VNodeFlags } from '../client/types';
import {
  registerQwikLoaderEvent,
  vnode_getDOMContainer,
  vnode_isVNode,
  vnode_walkVNode,
} from '../client/vnode-utils';
import { deserializeCaptureDeltas } from '../shared/qrl/qrl-class';
import { registerSingleton } from '../shared/singletons';
import type { QElement } from '../shared/types';
import { QHmrAttr, QHmrEvent, QHmrPath } from '../shared/utils/markers';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import type { SSRContainer } from '../ssr/ssr-types';
import { tryGetInvokeContext } from './use-core';

/** @internal */
export function _hmr(
  this: string | undefined,
  event: CustomEvent<{ files: string[]; t: number }>,
  element: Element
) {
  const container = getDomContainer(element);
  return whenContainerDataReady(container, () => {
    const updateHost = (host: VNode | undefined, path: string | null) => {
      if (
        host &&
        !(host.flags & VNodeFlags.Deleted) &&
        path &&
        event.detail.files.some((file) => path.startsWith(file)) &&
        vnode_getDOMContainer(host) === container
      ) {
        markVNodeDirty(container, host, ChoreBits.COMPONENT);
        const doc = container.document as any;
        doc.__hmrDone = event.detail.t;
      }
    };
    if (typeof this === 'string') {
      const [host, path] = deserializeCaptureDeltas(container, this);
      updateHost(
        host as VNode | undefined,
        (path as string) ?? element.getAttribute('data-qwik-inspector')
      );
      return;
    }
    const lastHmrEvents = registerSingleton(
      'lastHmrEvents',
      () => new WeakMap<ClientContainer, Event>()
    );
    if (lastHmrEvents.get(container) === event) {
      return;
    }
    lastHmrEvents.set(container, event);
    vnode_walkVNode(container.rootVNode, (host) => {
      if (host.flags & VNodeFlags.Virtual) {
        updateHost(host, container.getHostProp<string>(host, QHmrPath));
      }
    });
  });
}

/**
 * Injected by the optimizer into component$ bodies in HMR mode.
 *
 * @internal
 */
export function _useHmr(devPath: string): void {
  const iCtx = tryGetInvokeContext();
  if (!iCtx?.$container$ || !iCtx.$hostElement$) {
    return;
  }
  const { $container$: container, $hostElement$: host } = iCtx;
  container.setHostProp(host, QHmrPath, devPath);
  if (!vnode_isVNode(host)) {
    (container as SSRContainer).$enableHmr$(host);
    return;
  }
  const client = container as ClientContainer;
  const element: QElement = client.element;
  const handlers = (element._qDispatch ||= {});
  if (!handlers[QHmrEvent]) {
    handlers[QHmrEvent] = _hmr;
    element.setAttribute(QHmrAttr, '');
    registerQwikLoaderEvent(client, QHmrEvent);
  }
}
