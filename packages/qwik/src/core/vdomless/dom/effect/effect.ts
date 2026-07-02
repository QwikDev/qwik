import { isPromise, retryOnPromise } from '../../../shared/utils/promises';
import { logError } from '../../../shared/utils/log';
import type { ValueOrPromise } from '../../../shared/utils/types';
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
import { applyDomProps, patchAttrValue } from './dom-props';

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => TextExpressionValue;
export type AttrExpressionFn<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => unknown;
type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;
export type DomBatchFn = () => unknown;

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

  run(): unknown {
    return patchTextValue(this.text, this.fn(...this.args));
  }
}

export class TextNodeEffect {
  constructor(
    readonly text: Text,
    readonly source: Source<TextExpressionValue>
  ) {}

  run(): void {
    setTextData(this.text, readTrackedSourceValue(this.source));
  }
}

export class AttrEffect {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly source: Source,
    readonly styleScopedId?: string
  ) {}

  run(): void {
    patchAttrValue(
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

  run(): void {
    patchAttrValue(this.element, this.name, this.fn(...this.args), this.styleScopedId);
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

  run(): unknown {
    return this.fn();
  }
}

export class DomSubscription implements DomSubscriber {
  readonly kind = SubscriberKind.Dom;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly effect: DomEffect,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): void {
    cleanupDeps(this);

    retryOnPromise(() => {
      if (this.owner === null) {
        return;
      }
      return runWithCollector(this, () => this.effect.run());
    }, logError);
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
  source: Source<TextExpressionValue>,
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
  return createDomSubscription(new DomBatchEffect(fn), scheduler);
}

export function runDomBatchEffect(subscriber: DomSubscriber, fn: DomBatchFn): void {
  runWithCollector(subscriber, fn);
}

function createDomSubscription(effect: DomEffect, scheduler: Scheduler | undefined): DomSubscriber {
  return registerSubscriberToOwner(new DomSubscription(effect, scheduler ?? getActiveScheduler()));
}

export function patchTextValue(
  text: Text,
  value: TextExpressionValue | Promise<TextExpressionValue>
) {
  if (isPromise(value)) {
    return value.then((resolved) => {
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
