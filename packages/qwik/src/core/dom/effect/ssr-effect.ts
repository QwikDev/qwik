import { EffectKind } from './effect-kind.enum';
import { Phase } from '../../runtime/scheduler';
import { type AttrExpressionFn, type TextExpressionValue } from './effect';
import { isPromise, maybeThen, retryOnPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { SsrDomSubscriber, SsrForBlockSubscriber } from '../../runtime/subscriber';
import { SubscriberKind } from '../../runtime/subscriber';
import type { SsrEventAttrChunk } from '../../ssr/output';
import { readSourceValue, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import { withCaptures } from '../../shared/qrl/qrl-captures';
import { registerSubscriberToOwner } from '../../runtime/owner';
import type { Owner } from '../../runtime/owner';
import type { SSRForBlock } from '../for/for';
import { renderDomPropsToString, serializeAttrExpressionValue } from './dom-props';
import { isDev } from '@qwik.dev/core/build';

export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  (...args: TArgs) => ValueOrPromise<TextExpressionValue>
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
    readonly source?: Source,
    readonly styleScopedId: string | null = null
  ) {}
}

export class SsrAttrExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Attr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string,
    readonly args: TArgs,
    readonly qrl: AttrExpressionQrl<TArgs>,
    readonly styleScopedId: string | null = null
  ) {}
}

export class SsrPropsEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Props;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly target: SsrEffectTarget,
    readonly args: TArgs,
    readonly qrl: DomPropsQrl<TArgs>,
    readonly styleScopedId: string | null = null
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
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly effect: SsrDomEffect) {}
}

export class SSRForBlockSubscription<T = unknown> implements SsrForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  owner: Owner | null = null;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly block: SSRForBlock<T>) {}

  get effect(): SSRForBlock<T> {
    return this.block;
  }
}

export function createSsrTextNodeEffect(target: SsrEffectTarget): SsrDomSubscriber {
  return createSsrDomEffect(new SsrTextNodeEffect(target));
}

export function createSsrTextExpressionEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>
): SsrDomSubscriber {
  return createSsrDomEffect(new SsrTextExpressionEffect(target, args, qrl));
}

export function createSsrAttrEffect(
  target: SsrEffectTarget,
  name: string,
  styleScopedId?: string
): SsrDomSubscriber {
  return createSsrDomEffect(new SsrAttrEffect(target, name, undefined, styleScopedId));
}

export function createSsrAttrExpressionEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  name: string,
  args: TArgs,
  qrl: AttrExpressionQrl<TArgs>,
  styleScopedId?: string
): SsrDomSubscriber {
  return createSsrDomEffect(new SsrAttrExpressionEffect(target, name, args, qrl, styleScopedId));
}

export function createSsrPropsEffect<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: DomPropsQrl<TArgs>,
  styleScopedId?: string
): SsrDomSubscriber {
  return createSsrDomEffect(new SsrPropsEffect(target, args, qrl, styleScopedId));
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
): ValueOrPromise<string> {
  const subscriber = createSsrDomEffect(
    new SsrTextNodeEffect(target, batch ? source : undefined),
    batch
  );
  return retryOnPromise(() =>
    maybeThen(
      runWithCollector(subscriber, readTrackedSourceValue, source) as ValueOrPromise<unknown>,
      serializeSsrTextValue
    )
  );
}

export function renderSsrTextExpression<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>,
  batch?: SsrDomSubscriber
): ValueOrPromise<string> {
  const subscriber = createSsrDomEffect(new SsrTextExpressionEffect(target, args, qrl), batch);

  return retryOnPromise(() => {
    const fn = qrl.resolved;

    if (fn === undefined) {
      throw qrl.resolve();
    }

    return maybeThen(
      runWithCollector(subscriber, withCaptures(fn, args), ...args) as ValueOrPromise<unknown>,
      serializeSsrTextValue
    );
  });
}

function serializeSsrTextValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  return text === '' ? ' ' : text;
}

export function renderSsrAttr(
  target: SsrEffectTarget,
  name: string,
  source: Source,
  batch?: SsrDomSubscriber,
  styleScopedId?: string
): ValueOrPromise<string | null> {
  const subscriber = createSsrDomEffect(
    new SsrAttrEffect(target, name, batch ? source : undefined, styleScopedId),
    batch
  );
  return retryOnPromise(() =>
    maybeThen(
      runWithCollector(subscriber, readTrackedSourceValue, source) as ValueOrPromise<unknown>,
      (value) => serializeAttrExpressionValue(name, value, styleScopedId)
    )
  );
}

export function renderSsrAttrExpression<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  name: string,
  args: TArgs,
  qrl: AttrExpressionQrl<TArgs>,
  batch?: SsrDomSubscriber,
  styleScopedId?: string
): ValueOrPromise<string | null> {
  const subscriber = createSsrDomEffect(
    new SsrAttrExpressionEffect(target, name, args, qrl, styleScopedId),
    batch
  );

  return retryOnPromise(() => {
    const fn = qrl.resolved;

    if (fn === undefined) {
      throw qrl.resolve();
    }

    return maybeThen(
      runWithCollector(subscriber, withCaptures(fn, args), ...args) as ValueOrPromise<unknown>,
      (value) => serializeAttrExpressionValue(name, value, styleScopedId)
    );
  });
}

export function renderSsrProps<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  args: TArgs,
  qrl: DomPropsQrl<TArgs>,
  eventAttr?: (name: string, value: unknown) => SsrEventAttrChunk,
  batch?: SsrDomSubscriber,
  styleScopedId?: string
): ValueOrPromise<ReturnType<typeof renderDomPropsToString>> {
  const subscriber = createSsrDomEffect(
    new SsrPropsEffect(target, args, qrl, styleScopedId),
    batch
  );

  return retryOnPromise(() => {
    const fn = qrl.resolved;

    if (fn === undefined) {
      throw qrl.resolve();
    }

    return runWithCollector(subscriber, () => {
      const props = withCaptures(fn, args)(...args);
      if (isPromise(props)) {
        throw new Error('Promise values are not supported for JSX DOM props.');
      }
      return renderDomPropsToString(props, eventAttr, styleScopedId);
    });
  });
}

function createSsrDomEffect(
  effect: SsrScalarDomEffect,
  batch?: SsrDomSubscriber
): SsrDomSubscriber {
  if (batch) {
    addSsrBatchEffect(batch, effect);
    return batch;
  }
  return registerSubscriberToOwner(new SsrDomSubscription(effect));
}

function addSsrBatchEffect(batch: SsrDomSubscriber, effect: SsrScalarDomEffect): void {
  const batchEffect = batch.effect;
  if (isDev && !(batchEffect instanceof SsrDomBatchEffect)) {
    throw new Error('Expected SSR DOM batch effect.');
  }
  (batchEffect as SsrDomBatchEffect).effects.push(effect);
}

function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}
