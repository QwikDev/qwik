import type { ValueOrPromise } from '../../shared/utils/types';
import { SubscriberFlags } from '../../reactive/flags';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import {
  SubscriberKind,
  type DomSubscriber,
  type ForBlockSubscriber,
} from '../../runtime/subscriber';
import type { Source } from '../../reactive/source';
import { runWithCollector0 } from '../../reactive/tracking';
import type { Owner } from '../../runtime/owner';
import type { ForBlock } from '../for/for';
import { applyDomProps, patchAttrValue } from './dom-props';
import { createDomSubscription } from './dom-subscription';
import { readTrackedSourceValue } from './text-effect';
import { removeEvent, setEvent } from '../event/event';
import type { CapturedEventHandler, QDispatchHandler } from '../../shared/types';
import { EMPTY_ARRAY } from '../../utils/consts';

export type AttrExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<unknown>;
type DomPropsFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Record<string, unknown> | null | undefined;
export type EventExpressionFn<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => unknown;
export type DomBatchFn = () => ValueOrPromise<void>;

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

export class EventEffect<TArgs extends unknown[] = unknown[]> {
  constructor(
    readonly element: Element,
    readonly name: string,
    readonly args: TArgs,
    readonly fn: EventExpressionFn<TArgs>,
    readonly before: readonly QDispatchHandler[] = EMPTY_ARRAY,
    readonly after: readonly QDispatchHandler[] = EMPTY_ARRAY
  ) {}

  run(): void {
    const handlers = resolveEventHandlers(this.fn(...this.args), this.before, this.after);
    if (handlers === null) {
      removeEvent(this.element, this.name);
    } else {
      setEvent(this.element, this.name, handlers);
    }
  }
}

export class ForBlockSubscription<T = unknown> implements ForBlockSubscriber {
  readonly kind = SubscriberKind.ForBlock;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;

  constructor(
    readonly block: ForBlock<T>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<void> {
    return this.block.run(this);
  }
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

export function createEventEffect<TArgs extends unknown[]>(
  element: Element,
  name: string,
  args: TArgs,
  fn: EventExpressionFn<TArgs>,
  scheduler?: Scheduler,
  before: readonly QDispatchHandler[] = EMPTY_ARRAY,
  after: readonly QDispatchHandler[] = EMPTY_ARRAY
): DomSubscriber {
  return createDomSubscription(new EventEffect(element, name, args, fn, before, after), scheduler);
}

export function createDomBatchEffect(fn: DomBatchFn, scheduler?: Scheduler): DomSubscriber {
  const subscriber = createDomSubscription(fn, scheduler);
  runWithCollector0(subscriber, fn);
  return subscriber;
}

export function resolveEventHandlers(
  value: unknown,
  before: readonly QDispatchHandler[] = EMPTY_ARRAY,
  after: readonly QDispatchHandler[] = EMPTY_ARRAY
): QDispatchHandler | QDispatchHandler[] | null {
  if (before.length === 0 && after.length === 0 && !isEventHandlerList(value)) {
    return value == null || value === false ? null : (value as QDispatchHandler);
  }

  const handlers: QDispatchHandler[] = [];
  appendEventHandlers(handlers, before);
  appendEventHandlers(handlers, value);
  appendEventHandlers(handlers, after);
  return handlers.length === 0 ? null : handlers.length === 1 ? handlers[0] : handlers;
}

function appendEventHandlers(handlers: QDispatchHandler[], value: unknown): void {
  if (isEventHandlerList(value)) {
    for (let i = 0; i < value.length; i++) {
      appendEventHandlers(handlers, value[i]);
    }
    return;
  }
  if (value != null && value !== false) {
    handlers.push(value as QDispatchHandler);
  }
}

const isEventHandlerList = (value: unknown): value is unknown[] =>
  Array.isArray(value) && (value as CapturedEventHandler)._qRun === undefined;
