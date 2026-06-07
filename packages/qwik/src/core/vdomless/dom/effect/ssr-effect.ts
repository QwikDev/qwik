import { EffectKind } from './effect-kind.enum';
import { Phase } from '../../runtime/scheduler';
import { AttrSerializer, type TextExpressionFn } from './effect';
import type { SsrDomSubscriber } from '../../runtime/subscriber';
import { SubscriberKind } from '../../runtime/subscriber';
import { ReactiveFlags } from '../../reactive/flags';
import { type Dependency } from '../../reactive/source';
import type { QRLInternal } from '../../../shared/qrl/qrl-class';
import { registerSubscriberToOwner } from '../../runtime/owner';

export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  TextExpressionFn<TArgs>
>;

export type SsrDomEffect =
  | SsrTextExpressionEffect<any[]>
  | SsrTextNodeEffect
  | SsrAttrEffect
  | SsrSerializedAttrEffect;

export const enum EffectTargetKind {
  ElementText = 0,
  RangeText = 1,
  Element = 2,
}

export interface SsrEffectTarget {
  readonly kind: EffectTargetKind;
  readonly id: number;
}

export class SsrTextExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.TextExpression;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly args: TArgs,
    readonly qrl: TextExpressionQrl<TArgs>
  ) {}
}

export class SsrTextNodeEffect {
  readonly kind = EffectKind.TextNode;
  readonly phase = Phase.ScalarDom;

  constructor(readonly target: SsrEffectTarget) {}
}

export class SsrAttrEffect {
  readonly kind = EffectKind.Attr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string
  ) {}
}

export class SsrSerializedAttrEffect {
  readonly kind = EffectKind.SerializedAttr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly serializer: AttrSerializer
  ) {}
}

export class SsrDomSubscription implements SsrDomSubscriber {
  readonly kind = SubscriberKind.Dom;
  flags = ReactiveFlags.None;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly effect: SsrDomEffect) {}

  notify(): void {}
}

export function createSsrTextNodeEffect(target: SsrEffectTarget): SsrDomSubscriber {
  return registerSubscriberToOwner(new SsrDomSubscription(new SsrTextNodeEffect(target)));
}

export function createSsrTextExpressionEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>
): SsrDomSubscriber {
  return registerSubscriberToOwner(
    new SsrDomSubscription(new SsrTextExpressionEffect(target, args, qrl))
  );
}

export function createSsrAttrEffect(target: SsrEffectTarget, name: string): SsrDomSubscriber {
  return registerSubscriberToOwner(new SsrDomSubscription(new SsrAttrEffect(target, name)));
}

export function createSsrSerializedAttrEffect(
  target: SsrEffectTarget,
  serializer: AttrSerializer
): SsrDomSubscriber {
  return registerSubscriberToOwner(
    new SsrDomSubscription(new SsrSerializedAttrEffect(target, serializer))
  );
}
