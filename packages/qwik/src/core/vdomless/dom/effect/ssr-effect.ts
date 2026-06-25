import { EffectKind } from './effect-kind.enum';
import { Phase } from '../../runtime/scheduler';
import {
  serializeAttrExpressionValue,
  type AttrExpressionFn,
  type TextExpressionFn,
} from './effect';
import type { SsrDomSubscriber, SsrForBlockSubscriber } from '../../runtime/subscriber';
import { SubscriberKind } from '../../runtime/subscriber';
import { readSourceValue, type Dependency, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import type { QRLInternal } from '../../../shared/qrl/qrl-class';
import { withCaptures } from '../../../shared/qrl/qrl-captures';
import { registerSubscriberToOwner } from '../../runtime/owner';
import type { Owner } from '../../runtime/owner';
import type { SSRForBlock } from '../for/for';
import { renderDomPropsToString } from './dom-props';

export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  TextExpressionFn<TArgs>
>;
export type AttrExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  AttrExpressionFn<TArgs>
>;
type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;
export type DomPropsQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<DomPropsFn<TArgs>>;

export type SsrScalarDomEffect =
  | SsrTextExpressionEffect<any[]>
  | SsrTextNodeEffect
  | SsrAttrEffect
  | SsrAttrExpressionEffect<any[]>
  | SsrPropsEffect<any[]>;
export type SsrDomEffect = SsrScalarDomEffect | SsrDomBatchEffect;

export const enum EffectTargetKind {
  ElementText = 0,
  RangeText = 1,
  Element = 2,
}

export type SsrEffectTarget = SsrElementTextTarget | SsrRangeTextTarget | SsrElementTarget;

export interface SsrElementTextTarget {
  readonly kind: EffectTargetKind.ElementText;
  readonly id: number;
}

export interface SsrRangeTextTarget {
  readonly kind: EffectTargetKind.RangeText;
  readonly id: number;
  readonly markerIndex: number;
}

export interface SsrElementTarget {
  readonly kind: EffectTargetKind.Element;
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

  constructor(
    readonly target: SsrEffectTarget,
    readonly source?: Source
  ) {}
}

export class SsrAttrEffect {
  readonly kind = EffectKind.Attr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string,
    readonly source?: Source
  ) {}
}

export class SsrAttrExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Attr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string,
    readonly args: TArgs,
    readonly qrl: AttrExpressionQrl<TArgs>
  ) {}
}

export class SsrPropsEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Props;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly args: TArgs,
    readonly qrl: DomPropsQrl<TArgs>
  ) {}
}

export class SsrDomBatchEffect {
  readonly kind = EffectKind.DomBatch;
  readonly phase = Phase.ScalarDom;
  readonly effects: SsrScalarDomEffect[] = [];
}

export class SsrDomSubscription implements SsrDomSubscriber {
  readonly kind = SubscriberKind.Dom;
  owner: Owner | null = null;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly effect: SsrDomEffect) {}
}

export class SSRForBlockSubscription<T = unknown> implements SsrForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  owner: Owner | null = null;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly block: SSRForBlock<T>) {}

  get effect(): SSRForBlock<T> {
    return this.block;
  }
}

export function createSsrTextNodeEffect(target: SsrEffectTarget): SsrDomSubscriber {
  return useSsrDomEffect(undefined, new SsrTextNodeEffect(target));
}

export function createSsrTextExpressionEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>
): SsrDomSubscriber {
  return useSsrDomEffect(undefined, new SsrTextExpressionEffect(target, args, qrl));
}

export function createSsrAttrEffect(target: SsrEffectTarget, name: string): SsrDomSubscriber {
  return useSsrDomEffect(undefined, new SsrAttrEffect(target, name));
}

export function createSsrAttrExpressionEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  name: string,
  args: TArgs,
  qrl: AttrExpressionQrl<TArgs>
): SsrDomSubscriber {
  return useSsrDomEffect(undefined, new SsrAttrExpressionEffect(target, name, args, qrl));
}

export function createSsrPropsEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: DomPropsQrl<TArgs>
): SsrDomSubscriber {
  return useSsrDomEffect(undefined, new SsrPropsEffect(target, args, qrl));
}

export function createSsrDomBatchEffect(): SsrDomSubscriber {
  return registerSubscriberToOwner(new SsrDomSubscription(new SsrDomBatchEffect()));
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

export function createSsrRangeTextTarget(id: number, markerIndex: number): SsrEffectTarget {
  return {
    kind: EffectTargetKind.RangeText,
    id,
    markerIndex,
  };
}

export function renderSsrTextNode(
  target: SsrEffectTarget,
  source: Source,
  batch?: SsrDomSubscriber
): string {
  const subscriber = useSsrDomEffect(
    batch,
    new SsrTextNodeEffect(target, batch ? source : undefined)
  );
  return serializeSsrTextValue(runWithCollector(subscriber, readTrackedSourceValue, source));
}

export function renderSsrTextExpression<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>,
  batch?: SsrDomSubscriber
): string {
  const subscriber = useSsrDomEffect(batch, new SsrTextExpressionEffect(target, args, qrl));
  const fn = qrl.resolved;

  if (fn === undefined) {
    throw qrl.resolve();
  }

  return serializeSsrTextValue(runWithCollector(subscriber, withCaptures(fn, args), ...args));
}

function serializeSsrTextValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  return text === '' ? ' ' : text;
}

export function renderSsrAttr(
  target: SsrEffectTarget,
  name: string,
  source: Source,
  batch?: SsrDomSubscriber
): string {
  const subscriber = useSsrDomEffect(
    batch,
    new SsrAttrEffect(target, name, batch ? source : undefined)
  );
  return serializeAttrExpressionValue(
    name,
    runWithCollector(subscriber, readTrackedSourceValue, source)
  );
}

export function renderSsrAttrExpression<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  name: string,
  args: TArgs,
  qrl: AttrExpressionQrl<TArgs>,
  batch?: SsrDomSubscriber
): string {
  const subscriber = useSsrDomEffect(batch, new SsrAttrExpressionEffect(target, name, args, qrl));
  const fn = qrl.resolved;

  if (fn === undefined) {
    throw qrl.resolve();
  }

  return serializeAttrExpressionValue(
    name,
    runWithCollector(subscriber, withCaptures(fn, args), ...args)
  );
}

export function renderSsrProps<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: DomPropsQrl<TArgs>,
  eventAttr?: (name: string, value: unknown) => string,
  batch?: SsrDomSubscriber
) {
  const subscriber = useSsrDomEffect(batch, new SsrPropsEffect(target, args, qrl));
  const fn = qrl.resolved;

  if (fn === undefined) {
    throw qrl.resolve();
  }

  return runWithCollector(subscriber, () =>
    renderDomPropsToString(withCaptures(fn, args)(...args), eventAttr)
  );
}

function useSsrDomEffect(
  batch: SsrDomSubscriber | undefined,
  effect: SsrScalarDomEffect
): SsrDomSubscriber {
  if (batch) {
    addSsrBatchEffect(batch, effect);
    return batch;
  }
  return registerSubscriberToOwner(new SsrDomSubscription(effect));
}

function addSsrBatchEffect(batch: SsrDomSubscriber, effect: SsrScalarDomEffect): void {
  const batchEffect = batch.effect;
  if (!(batchEffect instanceof SsrDomBatchEffect)) {
    throw new Error('Expected SSR DOM batch effect.');
  }
  batchEffect.effects.push(effect);
}

function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}
