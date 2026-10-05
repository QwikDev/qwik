import type { ClientContainer } from '../client/types';
import type { Container, HostElement } from '../shared/types';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import {
  ELEMENT_SEQ,
  OnRenderProp,
  QContainerSelector,
  QErrorContentHost,
  QPendingResultParent,
} from '../shared/utils/markers';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { getStoreHandler, getStoreTarget } from '../reactive-primitives/impl/store';
import type { EffectSubscription } from '../reactive-primitives/types';
import { scheduleEffects } from '../reactive-primitives/utils';
import type { SubscriptionPatch } from '../shared/serdes/subscription-patch';
import {
  canRevealRegistration,
  type RevealItemLike,
  type RevealOrder,
  type RevealRegistrationLike,
} from '../shared/utils/reveal';
import { isOutOfOrderSegmentContainer } from '../shared/utils/container';
import { registerSingleton } from '../shared/singletons';
import { tryGetInvokeContext } from '../use/use-core';
import type { SSRContainer } from '../ssr/ssr-types';

/** @internal */
export const PENDING_QRL_SYMBOL = '_peC';

/** @internal */
export type OutOfOrderRevealBoundary = {
  attrs: string;
  showFallback: boolean;
  resolve: () => void;
};

type OutOfOrderRevealOrderCode = 'p' | 's' | 'r' | 't';
// The id lands in the HTML, so every copy of core rendering into a container must count together.
const outOfOrderRevealIds = /*#__PURE__*/ registerSingleton(
  'outOfOrderRevealIds',
  () => new WeakMap<Container, number>()
);

/** @internal */
export class OutOfOrderRevealCoordinator<ITEM extends RevealItemLike = RevealItemLike> {
  private count = 0;
  private pendingItems = new Set<ITEM>();
  private orderCode: OutOfOrderRevealOrderCode;

  constructor(
    private id: number,
    order: RevealOrder,
    private collapsed: boolean
  ) {
    this.orderCode = getOutOfOrderRevealOrderCode(order);
  }

  register(registration: RevealRegistrationLike<ITEM>): OutOfOrderRevealBoundary {
    this.pendingItems.add(registration.item);
    const index = this.count++;
    return {
      attrs:
        ` q:g="${this.id}" q:i="${index}" q:o="${this.orderCode}"` + (this.collapsed ? ' q:c' : ''),
      showFallback: this.canReveal(registration) || !this.collapsed,
      resolve: () => {
        this.pendingItems.delete(registration.item);
      },
    };
  }

  canReveal(registration: RevealRegistrationLike<ITEM>): boolean {
    return canRevealRegistration(registration, (item) => this.pendingItems.has(item));
  }

  script(): string {
    return this.count === 0 ? '' : `qO.g(${this.id},${this.count},"${this.orderCode}");`;
  }
}

/** @internal */
export const createOutOfOrderRevealCoordinator = <ITEM extends RevealItemLike = RevealItemLike>(
  order: RevealOrder,
  collapsed: boolean
): OutOfOrderRevealCoordinator<ITEM> => {
  const container = tryGetInvokeContext()!.$container$!;
  const id = (outOfOrderRevealIds.get(container) || 0) + 1;
  outOfOrderRevealIds.set(container, id);
  return new OutOfOrderRevealCoordinator<ITEM>(id, order, collapsed);
};

const getOutOfOrderRevealOrderCode = (order: RevealOrder): OutOfOrderRevealOrderCode => {
  switch (order) {
    case 'sequential':
      return 's';
    case 'reverse':
      return 'r';
    case 'together':
      return 't';
    default:
      return 'p';
  }
};

/** @internal */
export const isOutOfOrderStreaming = (): boolean => {
  if (!__EXPERIMENTAL__.pendingBoundary) {
    return false;
  }
  const container = tryGetInvokeContext()?.$container$ as
    | ({ readonly outOfOrderStreaming?: boolean } & Container)
    | undefined;
  return container?.outOfOrderStreaming === true && !isOutOfOrderSegmentContainer(container);
};

/** @internal */
export const nextOutOfOrderPendingId = (): number =>
  (tryGetInvokeContext()!.$container$! as SSRContainer).nextOutOfOrderId();

// Pending's `state` signal is the first hook it registers.
const PENDING_STATE_SEQ_INDEX = 0;

/**
 * The server serializes an out-of-order Pending in its 'fallback' state, so once qO() swaps the
 * content in, the client state must follow.
 */
export const markPendingContentSwapped = (container: ClientContainer, contentHost: Element) => {
  if (isCatchLateFallbackHost(contentHost)) {
    return;
  }
  const pendingHost = container.vNodeLocate(contentHost).parent as HostElement | null;
  if (!pendingHost) {
    return;
  }
  const renderQrl = container.getHostProp<QRLInternal>(pendingHost, OnRenderProp);
  if (renderQrl?.$symbol$ !== PENDING_QRL_SYMBOL) {
    return;
  }
  const state = container.getHostProp<unknown[]>(pendingHost, ELEMENT_SEQ)?.[
    PENDING_STATE_SEQ_INDEX
  ];
  if (state instanceof SignalImpl) {
    // qO() owns the DOM swap, so only the state needs to catch up.
    state.untrackedValue = 'content';
  }
};

/** Content hosts whose deferred content qO() swapped in before the container resumed. */
export const getSwappedPendingContentHosts = (containerElement: Element): Element[] =>
  Array.from(containerElement.querySelectorAll('[q\\:rp]')).filter(
    (contentHost) =>
      contentHost.closest(QContainerSelector) === containerElement &&
      !hasPendingPlaceholder(contentHost)
  );

// Catch reuses q:rp for a late fallback host, rendered right after its content host.
const isCatchLateFallbackHost = (host: Element) =>
  host.previousElementSibling?.hasAttribute(QErrorContentHost) === true;

const hasPendingPlaceholder = (contentHost: Element) =>
  contentHost.querySelector(`template[q\\:r="${contentHost.getAttribute(QPendingResultParent)}"]`)
    ?.parentElement === contentHost;

/** @internal */
export const applySubscriptionPatches = (
  container: Container,
  patches: SubscriptionPatch[] | undefined
): void => {
  if (!__EXPERIMENTAL__.pendingBoundary || !patches) {
    return;
  }
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const root = container.$getObjectById$(patch.rootId);
    const subscriptions = patch.subscriptions;
    if (root instanceof SignalImpl) {
      if (subscriptions instanceof Set) {
        mergeSubscriptionSet(container, root, root, (root.$effects$ ||= new Set()), subscriptions);
      }
    } else {
      if (!(subscriptions instanceof Map)) {
        continue;
      }
      const handler = getStoreHandler(root as any);
      const target = getStoreTarget(root as any);
      if (!handler || !target) {
        continue;
      }
      const effectsMap = (handler.$effects$ ||= new Map());
      for (const [storeProp, subscriptionSet] of subscriptions) {
        let rootEffects = effectsMap.get(storeProp);
        if (!rootEffects) {
          rootEffects = new Set();
          effectsMap.set(storeProp, rootEffects);
        }
        mergeSubscriptionSet(container, handler, target, rootEffects, subscriptionSet);
      }
    }
  }
};

const mergeSubscriptionSet = (
  container: Container,
  producer: unknown,
  backRef: unknown,
  rootEffects: Set<EffectSubscription>,
  patchEffects: Set<EffectSubscription>
): void => {
  let newEffects: Set<EffectSubscription> | undefined;
  for (const effect of patchEffects) {
    if (!rootEffects.has(effect)) {
      rootEffects.add(effect);
      (newEffects ||= new Set()).add(effect);
    }
    (effect.backRef ||= new Set()).add(backRef as any);
  }
  if (newEffects) {
    scheduleEffects(container, producer as any, newEffects);
  }
};
