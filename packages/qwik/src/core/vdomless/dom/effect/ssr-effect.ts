import { EffectKind } from './effect-kind.enum';
import { Phase } from '../../runtime/scheduler';
import { AttrSerializer, type TextExpressionFn } from './effect';
import type { SsrDomSubscriber } from '../../runtime/subscriber';
import { SubscriberKind } from '../../runtime/subscriber';
import { ReactiveFlags } from '../../reactive/flags';
import { readSourceValue, type Dependency, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import type { QRLInternal } from '../../../shared/qrl/qrl-class';
import { registerSubscriberToOwner } from '../../runtime/owner';
import type { ClassList } from '../../../shared/jsx/types/jsx-qwik-attributes';
import { serializeClass, stringifyStyle } from '../../../shared/utils/styles';

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

export function createSsrElementTextTarget(id: number): SsrEffectTarget {
  return {
    kind: EffectTargetKind.ElementText,
    id,
  };
}

export function createSsrElementTarget(id: number): SsrEffectTarget {
  return {
    kind: EffectTargetKind.Element,
    id,
  };
}

export function createSsrRangeTextTarget(id: number): SsrEffectTarget {
  return {
    kind: EffectTargetKind.RangeText,
    id,
  };
}

export function renderSsrTextNode(target: SsrEffectTarget, source: Source): string {
  const subscriber = createSsrTextNodeEffect(target);
  return String(runWithCollector(subscriber, readTrackedSourceValue, source));
}

export function renderSsrTextExpression<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>
): ReturnType<TextExpressionFn<TArgs>> {
  const subscriber = createSsrTextExpressionEffect(target, args, qrl);
  const fn = qrl.resolved;

  if (fn === undefined) {
    throw qrl.resolve();
  }

  return runWithCollector(subscriber, fn, ...args);
}

export function renderSsrAttr(target: SsrEffectTarget, name: string, source: Source): string {
  const subscriber = createSsrAttrEffect(target, name);
  return String(runWithCollector(subscriber, readTrackedSourceValue, source));
}

export function renderSsrClass(target: SsrEffectTarget, source: Source): string {
  const subscriber = createSsrSerializedAttrEffect(target, AttrSerializer.Class);
  const value = runWithCollector(subscriber, readTrackedSourceValue, source);
  return serializeClass(value as ClassList);
}

export function renderSsrStyle(target: SsrEffectTarget, source: Source): string {
  const subscriber = createSsrSerializedAttrEffect(target, AttrSerializer.Style);
  const value = runWithCollector(subscriber, readTrackedSourceValue, source);
  return stringifyStyle(value);
}

function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}
