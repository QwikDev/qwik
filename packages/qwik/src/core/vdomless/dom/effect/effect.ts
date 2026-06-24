import { isPromise } from '../../../shared/utils/promises';
import { serializeAttribute } from '../../../shared/utils/styles';
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
import { readSourceValue, type Dependency, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import type { Owner } from '../../runtime/owner';
import type { ForBlock } from '../for/for';
import { applyDomProps } from './dom-props';
import { isDev } from '@qwik.dev/core/build';

export const enum AttrSerializer {
  Class = 0,
  Style = 1,
}

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => TextExpressionValue;
export type AttrExpressionFn<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => unknown;
type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;
export type DomBatchFn = () => unknown;

export interface DomEffectOptions {
  scheduler?: Scheduler;
}

export type DomEffect =
  | TextExpressionEffect<any[]>
  | TextNodeEffect
  | AttrEffect
  | AttrExpressionEffect<any[]>
  | SerializedAttrEffect
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
    readonly source: Source
  ) {}

  run(): void {
    this.text.data = String(readTrackedSourceValue(this.source));
  }
}

export class AttrEffect {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly source: Source
  ) {}

  run(): void {
    this.element.setAttribute(this.name, String(readTrackedSourceValue(this.source)));
  }
}

export class AttrExpressionEffect<TArgs extends unknown[] = unknown[]> {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly args: TArgs,
    readonly fn: AttrExpressionFn<TArgs>
  ) {}

  run(): void {
    patchAttrValue(this.element, this.name, this.fn(...this.args));
  }
}

export class SerializedAttrEffect {
  constructor(
    readonly element: Element,
    readonly source: Source,
    readonly serializer: AttrSerializer
  ) {}

  run(): void {
    const value = readTrackedSourceValue(this.source);
    if (this.serializer === AttrSerializer.Class) {
      this.element.className = serializeAttrExpressionValue('class', value);
    } else {
      patchAttrValue(this.element, 'style', value);
    }
  }
}

export class PropsEffect<TArgs extends unknown[] = unknown[]> {
  private prevProps: Record<string, unknown> | null = null;

  constructor(
    readonly element: Element,
    readonly args: TArgs,
    readonly fn: DomPropsFn<TArgs>
  ) {}

  run(): void {
    this.prevProps = applyDomProps(this.element, this.fn(...this.args), this.prevProps);
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
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly effect: DomEffect,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): void {
    cleanupDeps(this);

    const value = runWithCollector(this, () => this.effect.run());
    assertSyncDomValue(value);
  }
}

export class ForBlockSubscription<T = unknown> implements ForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Dependency[] | null = null;
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
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(new TextExpressionEffect(text, args, fn), options?.scheduler);
}

export function createTextNodeEffect(
  text: Text,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(new TextNodeEffect(text, source), options?.scheduler);
}

export function createAttrEffect(
  element: Element,
  name: string,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(new AttrEffect(element, name, source), options?.scheduler);
}

export function createAttrExpressionEffect<TArgs extends unknown[]>(
  element: Element,
  name: string,
  args: TArgs,
  fn: AttrExpressionFn<TArgs>,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(
    new AttrExpressionEffect(element, name, args, fn),
    options?.scheduler
  );
}

export function createClassEffect(
  element: Element,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(
    new SerializedAttrEffect(element, source, AttrSerializer.Class),
    options?.scheduler
  );
}

export function createStyleEffect(
  element: Element,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(
    new SerializedAttrEffect(element, source, AttrSerializer.Style),
    options?.scheduler
  );
}

export function createPropsEffect<TArgs extends unknown[]>(
  element: Element,
  args: TArgs,
  fn: DomPropsFn<TArgs>,
  options?: DomEffectOptions
): DomSubscriber {
  return createDomSubscription(new PropsEffect(element, args, fn), options?.scheduler);
}

export function createDomBatchEffect(fn: DomBatchFn, options?: DomEffectOptions): DomSubscriber {
  return createDomSubscription(new DomBatchEffect(fn), options?.scheduler);
}

export function runDomBatchEffect(subscriber: DomSubscriber, fn: DomBatchFn): void {
  assertSyncDomValue(runWithCollector(subscriber, fn));
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

export function serializeAttrExpressionValue(name: string, value: unknown): string {
  const serialized = serializeAttribute(name, value);
  return serialized == null || serialized === false || serialized === true
    ? ''
    : String(serialized);
}

function patchAttrValue(element: Element, name: string, value: unknown): void {
  element.setAttribute(name, serializeAttrExpressionValue(name, value));
}

export function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}

function getActiveScheduler(): Scheduler {
  return getActiveInvokeContextOrNull()?.container?.scheduler ?? defaultScheduler;
}

function assertSyncDomValue(value: unknown): void {
  if (isDev && isPromise(value)) {
    throw new Error('Scalar DOM effects must be synchronous');
  }
}
