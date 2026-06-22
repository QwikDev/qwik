import type { Container } from '../shared/types';
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
import { tryGetInvokeContext } from '../use/use-core';
import type { SSRContainer } from '../ssr/ssr-types';

/** @internal */
export const SUSPENSE_QRL_SYMBOL = '_suC';

/** @internal */
export type OutOfOrderRevealBoundary = {
  attrs: string;
  showFallback: boolean;
  resolve: () => void;
};

type OutOfOrderRevealOrderCode = 'p' | 's' | 'r' | 't';
const outOfOrderRevealIds = new WeakMap<Container, number>();

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
  if (!isOutOfOrderStreaming()) {
    return null!;
  }
  const container = tryGetInvokeContext()?.$container$;
  let id = 0;
  if (container) {
    id = (outOfOrderRevealIds.get(container) || 0) + 1;
    outOfOrderRevealIds.set(container, id);
  }
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
  if (!__EXPERIMENTAL__.suspense) {
    return false;
  }
  const container = tryGetInvokeContext()?.$container$ as
    | ({ readonly outOfOrderStreaming?: boolean } & Container)
    | undefined;
  return container?.outOfOrderStreaming === true && !isOutOfOrderSegmentContainer(container);
};

/** @internal */
export const nextOutOfOrderSuspenseId = (): number => {
  if (!__EXPERIMENTAL__.suspense) {
    return 0;
  }
  const container = tryGetInvokeContext()?.$container$ as SSRContainer | undefined;
  if (container?.outOfOrderStreaming !== true) {
    return 0;
  }
  return container?.nextOutOfOrderId?.() ?? 0;
};

/**
 * Reserve a per-container id for an `<ErrorBoundary>`'s two-host swap without arming the OOOS
 * executor.
 *
 * @internal
 */
export const nextErrorBoundaryId = (): number => {
  if (!__EXPERIMENTAL__.errorBoundary) {
    return 0;
  }
  const container = tryGetInvokeContext()?.$container$ as SSRContainer | undefined;
  return container?.nextOutOfOrderId?.(false) ?? 0;
};

/** @internal */
export const applySubscriptionPatches = (
  container: Container,
  patches: SubscriptionPatch[] | undefined
): void => {
  if (!__EXPERIMENTAL__.suspense || !patches) {
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
