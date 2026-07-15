import { isPromise, retryOnPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { cleanupDeps } from '../../reactive/cleanup';
import { SubscriberFlags } from '../../reactive/flags';
import { registerSubscriberToOwner } from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type ForBlockSubscriber,
} from '../../runtime/subscriber';
import { readSourceValue, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import type { Owner } from '../../runtime/owner';
import type { ForBlock } from '../for/for';
import { applyDomProps, commitDomPromise, patchAttrValue } from './dom-props';

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<TextExpressionValue>;
export type AttrExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<unknown>;
type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;
export type DomBatchFn = () => ValueOrPromise<void>;

export type DomEffect =
  | TextExpressionEffect<any[]>
  | TextNodeEffect
  | AttrEffect
  | AttrExpressionEffect<any[]>
  | PropsEffect<any[]>
  | DomBatchEffect;

export class TextExpressionEffect<TArgs extends unknown[] = unknown[]> {
  constructor(
    readonly text: Text,
    readonly args: TArgs,
    readonly fn: TextExpressionFn<TArgs>
  ) {}

  run(): ValueOrPromise<void> {
    return patchTextValue(this.text, this.fn(...this.args));
  }
}

export class TextNodeEffect {
  constructor(
    readonly text: Text,
    readonly source: Source<ValueOrPromise<TextExpressionValue>>
  ) {}

  run(): ValueOrPromise<void> {
    return patchTextValue(this.text, readTrackedSourceValue(this.source));
  }
}

export class AttrEffect {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly source: Source,
    readonly styleScopedId?: string
  ) {}

  run(): ValueOrPromise<void> {
    return patchAttrValue(
      this.element,
      this.name,
      readTrackedSourceValue(this.source),
      this.styleScopedId
    );
  }
}

export class AttrExpressionEffect<TArgs extends unknown[] = unknown[]> {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly args: TArgs,
    readonly fn: AttrExpressionFn<TArgs>,
    readonly styleScopedId?: string
  ) {}

  run(): ValueOrPromise<void> {
    return patchAttrValue(this.element, this.name, this.fn(...this.args), this.styleScopedId);
  }
}

export class PropsEffect<TArgs extends unknown[] = unknown[]> {
  private prevProps: Record<string, unknown> | null = null;

  constructor(
    readonly element: Element,
    readonly args: TArgs,
    readonly fn: DomPropsFn<TArgs>,
    readonly styleScopedId?: string
  ) {}

  run(): void {
    this.prevProps = applyDomProps(
      this.element,
      this.fn(...this.args),
      this.prevProps,
      this.styleScopedId
    );
  }
}

export class DomBatchEffect {
  constructor(readonly fn: DomBatchFn) {}

  run(): ValueOrPromise<void> {
    return this.fn();
  }
}

export class DomSubscription implements DomSubscriber {
  readonly kind = SubscriberKind.Dom;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;
  declare private asyncGeneration: number | undefined;
  declare private asyncInvalidation: Promise<void> | undefined;
  declare private invalidateAsync: (() => void) | undefined;

  constructor(
    readonly effect: DomEffect,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  invalidate(): void {
    const invalidate = this.invalidateAsync;
    if (invalidate !== undefined) {
      this.asyncInvalidation = this.invalidateAsync = undefined;
      this.asyncGeneration!++;
      invalidate();
    }
  }

  run(): ValueOrPromise<void> {
    if (this.owner === null) {
      return;
    }
    this.invalidate();
    return retryOnPromise(() => {
      cleanupDeps(this);
      return this.owner === null ? undefined : runWithCollector(this, () => this.effect.run());
    });
  }

  trackPromise<T>(promise: Promise<T>, commit: (value: T) => void): Promise<void> {
    const generation = (this.asyncGeneration ??= 0);
    const invalidation = (this.asyncInvalidation ??= new Promise<void>((resolve) => {
      this.invalidateAsync = resolve;
    }));
    const pending = Promise.race([
      promise.then((value) => {
        if (this.owner !== null && generation === this.asyncGeneration) {
          commit(value);
        }
      }),
      invalidation,
    ]);
    this.scheduler.waitFor(pending);
    return pending;
  }
}

export class ForBlockSubscription<T = unknown> implements ForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly block: ForBlock<T>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<void> {
    return this.block.run(this);
  }
}

export function createTextExpressionEffect<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  fn: TextExpressionFn<TArgs>,
  scheduler?: Scheduler
): DomSubscriber {
  return createDomSubscription(new TextExpressionEffect(text, args, fn), scheduler);
}

export function createTextNodeEffect(
  text: Text,
  source: Source<ValueOrPromise<TextExpressionValue>>,
  scheduler?: Scheduler
): DomSubscriber {
  return createDomSubscription(new TextNodeEffect(text, source), scheduler);
}

export function createAttrEffect(
  element: Element,
  name: string,
  source: Source,
  scheduler?: Scheduler,
  styleScopedId?: string
): DomSubscriber {
  return createDomSubscription(new AttrEffect(element, name, source, styleScopedId), scheduler);
}

export function createAttrExpressionEffect<TArgs extends unknown[]>(
  element: Element,
  name: string,
  args: TArgs,
  fn: AttrExpressionFn<TArgs>,
  scheduler?: Scheduler,
  styleScopedId?: string
): DomSubscriber {
  return createDomSubscription(
    new AttrExpressionEffect(element, name, args, fn, styleScopedId),
    scheduler
  );
}

export function createPropsEffect<TArgs extends unknown[]>(
  element: Element,
  args: TArgs,
  fn: DomPropsFn<TArgs>,
  scheduler?: Scheduler,
  styleScopedId?: string
): DomSubscriber {
  return createDomSubscription(new PropsEffect(element, args, fn, styleScopedId), scheduler);
}

export function createDomBatchEffect(fn: DomBatchFn, scheduler?: Scheduler): DomSubscriber {
  const subscriber = createDomSubscription(new DomBatchEffect(fn), scheduler);
  runWithCollector(subscriber, fn);
  return subscriber;
}

function createDomSubscription(effect: DomEffect, scheduler: Scheduler | undefined): DomSubscriber {
  return registerSubscriberToOwner(new DomSubscription(effect, scheduler ?? getActiveScheduler()));
}

export function patchTextValue(
  text: Text,
  value: TextExpressionValue | Promise<TextExpressionValue>
): ValueOrPromise<void> {
  if (isPromise(value)) {
    return commitDomPromise(value, (resolved) => {
      setTextData(text, resolved);
    });
  }

  setTextData(text, value);
}

function setTextData(text: Text, value: TextExpressionValue): void {
  text.data = value == null ? '' : String(value);
}

export function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}

function getActiveScheduler(): Scheduler {
  return getActiveInvokeContextOrNull()?.container?.scheduler ?? defaultScheduler;
}
