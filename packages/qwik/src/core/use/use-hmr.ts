import { getDomContainer, whenContainerDataReady } from '../client/dom-container';
import { type ClientContainer, VNodeFlags } from '../client/types';
import {
  registerQwikLoaderEvent,
  vnode_getDOMContainer,
  vnode_isVNode,
} from '../client/vnode-utils';
import { deserializeCaptureDeltas } from '../shared/qrl/qrl-class';
import { registerSingleton } from '../shared/singletons';
import type { QElement } from '../shared/types';
import { QHmrAttr, QHmrEvent, QHmrPath, QHmrTargets } from '../shared/utils/markers';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import type { SSRContainer } from '../ssr/ssr-types';
import { tryGetInvokeContext } from './use-core';

interface HmrState {
  clientTargets: Map<string, Set<VNode>>;
  serverTargets: WeakMap<Element, Map<string, number[]>>;
  lastEvent?: Event;
}

const hmrStates = /*#__PURE__*/ registerSingleton(
  'hmrStates',
  () => new WeakMap<ClientContainer, HmrState>()
);

function getHmrState(container: ClientContainer): HmrState {
  let state = hmrStates.get(container);
  if (!state) {
    state = { clientTargets: new Map(), serverTargets: new WeakMap() };
    hmrStates.set(container, state);
  }
  return state;
}

export function unregisterHmrHost(container: ClientContainer, host: VNode): void {
  const file = container.getHostProp<string>(host, QHmrPath);
  if (file === null) {
    return;
  }
  const clientTargets = hmrStates.get(container)?.clientTargets;
  const targets = clientTargets?.get(file);
  if (targets?.delete(host) && targets.size === 0) {
    clientTargets!.delete(file);
  }
}

/**
 * HMR event handler. Resolves indexed host references for the changed files and schedules
 * re-renders. Older SSR listeners pass their serialized host and file captures as `this`.
 *
 * @internal
 */
export function _hmr(
  this: string | undefined,
  event: CustomEvent<{ files: string[]; t: number }>,
  element: Element
) {
  const container = getDomContainer(element);
  return whenContainerDataReady(container, () => {
    const updateHost = (host: VNode) => {
      if (!(host.flags & VNodeFlags.Deleted) && vnode_getDOMContainer(host) === container) {
        markVNodeDirty(container, host, ChoreBits.COMPONENT);
        const doc = container.document as any;
        doc.__hmrDone = event.detail.t;
      }
    };
    if (typeof this === 'string') {
      const [host, path] = deserializeCaptureDeltas(container, this);
      const hmrPath = (path as string) ?? element.getAttribute('data-qwik-inspector');
      if (
        vnode_isVNode(host) &&
        hmrPath &&
        event.detail.files.some((file) => hmrPath.startsWith(file))
      ) {
        updateHost(host);
      }
      return;
    }

    const state = getHmrState(container);
    let serverTargets = state.serverTargets.get(element);
    if (!serverTargets) {
      const serializedTargets = element.getAttribute(QHmrTargets);
      if (serializedTargets) {
        serverTargets = new Map<string, number[]>(JSON.parse(serializedTargets));
        state.serverTargets.set(element, serverTargets);
      }
    }
    const updateClientTargets = state.lastEvent !== event;
    state.lastEvent = event;
    for (const file of new Set(event.detail.files)) {
      const clientTargets = updateClientTargets ? state.clientTargets.get(file) : undefined;
      if (clientTargets) {
        for (const host of clientTargets) {
          updateHost(host);
        }
      }
      const rootIds = serverTargets?.get(file);
      if (rootIds) {
        for (let i = 0; i < rootIds.length; i++) {
          const host = container.$getObjectById$(rootIds[i]);
          if (vnode_isVNode(host) && container.getHostProp(host, QHmrPath) === null) {
            updateHost(host);
          }
        }
      }
    }
  });
}

/**
 * Injected by the optimizer into component$ bodies in HMR mode. Registers the host by source file
 * for the container's HMR handler.
 *
 * @internal
 */
export function _useHmr(devPath: string): void {
  const iCtx = tryGetInvokeContext();
  if (!iCtx?.$container$ || !iCtx.$hostElement$) {
    return;
  }
  const { $container$: container, $hostElement$: host } = iCtx;
  const file = devPath.split('?', 1)[0];
  if (!vnode_isVNode(host)) {
    (container as SSRContainer).$registerHmrHost$(file, host);
    return;
  }
  const client = container as ClientContainer;
  const previousFile = client.getHostProp<string>(host, QHmrPath);
  if (previousFile === file) {
    return;
  }
  if (previousFile !== null) {
    unregisterHmrHost(client, host);
  }
  client.setHostProp(host, QHmrPath, file);
  const { clientTargets } = getHmrState(client);
  let targets = clientTargets.get(file);
  if (!targets) {
    targets = new Set();
    clientTargets.set(file, targets);
  }
  targets.add(host);
  const element: QElement = client.element;
  const handlers = (element._qDispatch ||= {});
  if (!handlers[QHmrEvent]) {
    handlers[QHmrEvent] = _hmr;
    element.setAttribute(QHmrAttr, '');
    registerQwikLoaderEvent(client, QHmrEvent);
  }
}
