import { _textValue } from '../../shared/utils/character-escaping';
import { EffectKind } from './effect-kind.enum';
import { defaultScheduler, type TaskScheduler } from '../../runtime/scheduler';
import { resolveEventHandlers, type AttrExpressionFn, type EventExpressionFn } from './effect';
import type { TextExpressionValue } from './text-effect';
import { isPromise, maybeThen, retryOnPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { SsrDomSubscriber, SsrForBlockSubscriber } from '../../runtime/subscriber';
import { SubscriberKind, takeDirty } from '../../runtime/subscriber';
import type { SsrEventAttrChunk } from '../../ssr/output';
import { readSourceValue, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import { withCaptures } from '../../shared/qrl/qrl-captures';
import { registerSubscriberToOwner } from '../../runtime/owner';
import type { Owner } from '../../runtime/owner';
import type { QDispatchHandler } from '../../shared/types';
import type { SSRForBlock } from '../for/for';
import { renderDomPropsToString, serializeAttrExpressionValue } from './dom-props';
import { isDev } from '@qwik.dev/core/build';
import { SubscriberFlags } from '../../reactive/flags';
import { cleanupDeps } from '../../reactive/cleanup';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import { isSubscriberDisposed } from '../../runtime/subscriber';
import { EMPTY_ARRAY } from '../../utils/consts';

export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  (...args: TArgs) => ValueOrPromise<TextExpressionValue>
>;
export type AttrExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  AttrExpressionFn<TArgs>
>;
export type EventExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  EventExpressionFn<TArgs>
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
  | SsrEventEffect<any[]>
  | SsrPropsEffect<any[]>;
export type SsrDomEffect = SsrScalarDomEffect | SsrDomBatchEffect;
export type SsrAttributePatch = readonly [targetId: number, name: string, value: string | null];

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

  constructor(
    readonly target: SsrEffectTarget,
    readonly args: TArgs,
    readonly qrl: TextExpressionQrl<TArgs>
  ) {}
}

export class SsrTextNodeEffect {
  readonly kind = EffectKind.TextNode;

  constructor(
    readonly target: SsrEffectTarget,
    readonly source?: Source,
    /** Concat operands keep JS `String()` coercion; JSX positions suppress nullish/booleans. */
    readonly stringify: boolean = false
  ) {}
}

export class SsrAttrEffect {
  readonly kind = EffectKind.Attr;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string,
    readonly source?: Source,
    readonly styleScopedId: string | null = null
  ) {}
}

export class SsrAttrExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Attr;

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

  constructor(
    readonly target: SsrEffectTarget,
    readonly args: TArgs,
    readonly qrl: DomPropsQrl<TArgs>,
    readonly styleScopedId: string | null = null
  ) {}
}

export class SsrEventEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Event;

  constructor(
    readonly target: SsrEffectTarget,
    readonly name: string,
    readonly args: TArgs,
    readonly qrl: EventExpressionQrl<TArgs>,
    readonly before: readonly QDispatchHandler[] = EMPTY_ARRAY,
    readonly after: readonly QDispatchHandler[] = EMPTY_ARRAY
  ) {}
}

export class SsrDomBatchEffect {
  readonly kind = EffectKind.DomBatch;
  readonly effects: SsrScalarDomEffect[] = [];
}

export class SsrDomSubscription implements SsrDomSubscriber {
  readonly kind = SubscriberKind.Dom;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  patch: SsrAttributePatch | null = null;
  private pendingValue: Promise<unknown> | undefined;
  private cancelAsync: (() => void) | undefined;

  constructor(
    readonly effect: SsrDomEffect,
    readonly scheduler: TaskScheduler = getActiveInvokeContextOrNull()?.container?.scheduler ??
      defaultScheduler
  ) {}

  invalidate(): void {
    this.pendingValue = undefined;
    const cancel = this.cancelAsync;
    this.cancelAsync = undefined;
    cancel?.();
  }

  schedulePromise(promise: Promise<unknown>): void {
    this.scheduler.notify(this);
    this.pendingValue = promise;
  }

  run(): ValueOrPromise<void> {
    if (!takeDirty(this)) {
      return;
    }
    const pendingValue = this.pendingValue;
    this.invalidate();
    this.patch = null;
    const effect = this.effect;
    // only attributes on elements are supported for backpatch
    if (
      effect.kind !== EffectKind.Attr ||
      effect.target.kind !== EffectTargetKind.Element ||
      (effect instanceof SsrAttrEffect && effect.source === undefined)
    ) {
      return;
    }
    const value =
      pendingValue ??
      retryOnPromise(() => {
        cleanupDeps(this);
        if (isSubscriberDisposed(this)) {
          return;
        }
        if (effect instanceof SsrAttrEffect) {
          return runWithCollector(this, readTrackedSourceValue, effect.source!);
        }
        if (effect instanceof SsrAttrExpressionEffect) {
          const fn = effect.qrl.resolved;
          if (fn === undefined) {
            throw effect.qrl.resolve();
          }
          return runWithCollector(this, withCaptures(fn, effect.args), ...effect.args);
        }
      });
    const commit = (resolved: unknown) => {
      this.patch = [
        effect.target.id,
        effect.name,
        serializeAttrExpressionValue(effect.name, resolved, effect.styleScopedId ?? undefined),
      ];
    };
    return isPromise(value) ? this.trackPromise(value, commit) : commit(value);
  }

  private trackPromise<T>(promise: Promise<T>, commit: (value: T) => void): Promise<void> {
    let cancel!: () => void;
    const invalidation = new Promise<void>((resolve) => (cancel = resolve));
    this.cancelAsync = cancel;
    return Promise.race([
      promise.then((value) => {
        if (!isSubscriberDisposed(this) && this.cancelAsync === cancel) {
          commit(value);
        }
      }),
      invalidation,
    ]).finally(() => {
      if (this.cancelAsync === cancel) {
        this.cancelAsync = undefined;
      }
    });
  }
}

export class SSRForBlockSubscription<T = unknown> implements SsrForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  readonly scheduler = null;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;

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
  batch?: SsrDomSubscriber,
  stringify = false
): ValueOrPromise<string> {
  const subscriber = createSsrDomEffect(
    new SsrTextNodeEffect(target, batch ? source : undefined, stringify),
    batch
  );
  return retryOnPromise(() =>
    maybeThen(
      runWithCollector(subscriber, readTrackedSourceValue, source) as ValueOrPromise<unknown>,
      (value) => serializeSsrTextValue(value, stringify)
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

function serializeSsrTextValue(value: unknown, stringify = false): string {
  const text = stringify ? String(value) : _textValue(value);
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
    new SsrAttrEffect(target, name, source, styleScopedId),
    batch
  );
  const value = retryOnPromise(() => runWithCollector(subscriber, readTrackedSourceValue, source));
  return serializeOrScheduleAttr(subscriber, name, value, styleScopedId);
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

  const value = retryOnPromise(() => {
    const fn = qrl.resolved;

    if (fn === undefined) {
      throw qrl.resolve();
    }

    return runWithCollector(subscriber, withCaptures(fn, args), ...args);
  });
  return serializeOrScheduleAttr(subscriber, name, value, styleScopedId);
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

export function renderSsrEvent<TArgs extends unknown[]>(
  target: SsrEffectTarget,
  name: string,
  args: TArgs,
  qrl: EventExpressionQrl<TArgs>,
  eventAttr: (name: string, value: unknown) => SsrEventAttrChunk,
  before: readonly QDispatchHandler[] = EMPTY_ARRAY,
  after: readonly QDispatchHandler[] = EMPTY_ARRAY,
  batch?: SsrDomSubscriber
): ValueOrPromise<SsrEventAttrChunk | null> {
  const subscriber = createSsrDomEffect(
    new SsrEventEffect(target, name, args, qrl, before, after),
    batch
  );

  return retryOnPromise(() => {
    const fn = qrl.resolved;
    if (fn === undefined) {
      throw qrl.resolve();
    }
    const value = runWithCollector(subscriber, withCaptures(fn, args), ...args);
    if (isPromise(value)) {
      throw new Error('Promise values are not supported for JSX DOM events.');
    }
    const handlers = resolveEventHandlers(value, before, after);
    return handlers === null ? null : eventAttr(name, handlers);
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

function serializeOrScheduleAttr(
  subscriber: SsrDomSubscriber,
  name: string,
  value: ValueOrPromise<unknown>,
  styleScopedId?: string
): ValueOrPromise<string | null> {
  if (isPromise(value)) {
    if (subscriber.effect.kind === EffectKind.DomBatch) {
      return maybeThen(value, (resolved) =>
        serializeAttrExpressionValue(name, resolved, styleScopedId)
      );
    }
    (subscriber as SsrDomSubscription).schedulePromise(value);
    return null;
  }
  return serializeAttrExpressionValue(name, value, styleScopedId);
}
