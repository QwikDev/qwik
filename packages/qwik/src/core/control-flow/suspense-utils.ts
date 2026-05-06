import type { Container } from '../shared/types';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { getStoreHandler, getStoreTarget } from '../reactive-primitives/impl/store';
import type { EffectSubscription } from '../reactive-primitives/types';
import { scheduleEffects } from '../reactive-primitives/utils';
import {
  canRevealRegistration,
  type RevealItemLike,
  type RevealOrder,
  type RevealRegistrationLike,
} from '../shared/utils/reveal';
import { tryGetInvokeContext } from '../use/use-core';

/** @internal */
export const SUSPENSE_QRL_SYMBOL = '_suC';

/** @internal */
export type OutOfOrderRevealBoundary = {
  attrs: string;
  props: Record<string, string | boolean>;
  showFallback: boolean;
};

/** @internal */
export type OutOfOrderRevealBoundaryRegistration = {
  register: () => OutOfOrderRevealBoundary;
};

/** @internal */
export type ExternalRootEffectsPatch = Array<
  [number, EffectSubscription[] | Array<[string | symbol, EffectSubscription[]]>]
>;

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

  boundary(registration: RevealRegistrationLike<ITEM>): OutOfOrderRevealBoundaryRegistration {
    return {
      register: () => this.register(registration),
    };
  }

  register(registration: RevealRegistrationLike<ITEM>): OutOfOrderRevealBoundary {
    this.pendingItems.add(registration.item);
    const index = this.count++;
    const props: Record<string, string | boolean> = {
      'q:g': `${this.id}`,
      'q:i': `${index}`,
      'q:o': this.orderCode,
    };
    if (this.collapsed) {
      props['q:c'] = true;
    }
    return {
      attrs:
        ` q:g="${this.id}" q:i="${index}" q:o="${this.orderCode}"` + (this.collapsed ? ' q:c' : ''),
      props,
      showFallback:
        canRevealRegistration(registration, (item) => this.pendingItems.has(item)) ||
        !this.collapsed,
    };
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
  if (!__EXPERIMENTAL__.suspense) {
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
    | { readonly outOfOrderStreaming?: boolean }
    | undefined;
  return container?.outOfOrderStreaming === true;
};

/** @internal */
export const mergeExternalRootEffects = (
  container: Container,
  segmentStateData: unknown[],
  externalRootEffectsIndex: string | null
): void => {
  if (!__EXPERIMENTAL__.suspense || !externalRootEffectsIndex) {
    return;
  }
  const patches = segmentStateData[Number(externalRootEffectsIndex)] as
    | ExternalRootEffectsPatch
    | undefined;
  if (!patches) {
    return;
  }
  for (let i = 0; i < patches.length; i++) {
    const [rootId, patchEffects] = patches[i];
    const root = container.$getObjectById$(rootId);
    if (root instanceof SignalImpl) {
      mergeExternalRootEffectSet(
        container,
        root,
        root,
        (root.$effects$ ||= new Set()),
        patchEffects as EffectSubscription[]
      );
    } else {
      const handler = getStoreHandler(root as any);
      const target = getStoreTarget(root as any);
      if (!handler || !target) {
        continue;
      }
      const effectsMap = (handler.$effects$ ||= new Map());
      for (const [prop, effects] of patchEffects as Array<
        [string | symbol, EffectSubscription[]]
      >) {
        let rootEffects = effectsMap.get(prop);
        if (!rootEffects) {
          rootEffects = new Set();
          effectsMap.set(prop, rootEffects);
        }
        mergeExternalRootEffectSet(container, handler, target, rootEffects, effects);
      }
    }
  }
};

const mergeExternalRootEffectSet = (
  container: Container,
  producer: unknown,
  backRef: unknown,
  rootEffects: Set<EffectSubscription>,
  patchEffects: EffectSubscription[]
): void => {
  let newEffects: Set<EffectSubscription> | undefined;
  for (const effect of patchEffects) {
    if (!rootEffects.has(effect)) {
      rootEffects.add(effect);
      (newEffects ||= new Set()).add(effect);
    }
    (effect.backRef ||= new Set()).add(backRef as any);
  }
  scheduleEffects(container, producer as any, newEffects);
};
