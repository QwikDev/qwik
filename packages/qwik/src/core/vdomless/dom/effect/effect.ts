import type { ClassList } from '../../../shared/jsx/types/jsx-qwik-attributes';
import { isPromise } from '../../../shared/utils/promises';
import { serializeClass, stringifyStyle } from '../../../shared/utils/styles';
import { SubscriberFlags } from '../../reactive/flags';
import { registerSubscriberToOwner } from '../../runtime/owner';
import { defaultScheduler, Phase, type Scheduler } from '../../runtime/scheduler';
import { SubscriberKind, type DomSubscriber } from '../../runtime/subscriber';
import { readSourceValue, type Dependency, type Source } from '../../reactive/source';
import { track } from '../../reactive/tracking';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import { EffectKind } from './effect-kind.enum';
import type { Owner } from '../../runtime/owner';

export const enum AttrSerializer {
  Class = 0,
  Style = 1,
}

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => TextExpressionValue;

export interface DomEffectOptions {
  scheduler?: Scheduler;
}

export type DomEffect =
  | TextExpressionEffect<any[]>
  | TextNodeEffect
  | AttrEffect
  | SerializedAttrEffect;

export class TextExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.TextExpression;
  readonly phase = Phase.ScalarDom;

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
  readonly kind = EffectKind.TextNode;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly text: Text,
    readonly source: Source
  ) {}

  run(): void {
    this.text.data = String(readTrackedSourceValue(this.source));
  }
}

export class AttrEffect {
  readonly kind = EffectKind.Attr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly element: Element,
    readonly name: string,
    readonly source: Source
  ) {}

  run(): void {
    this.element.setAttribute(this.name, String(readTrackedSourceValue(this.source)));
  }
}

export class SerializedAttrEffect {
  readonly kind = EffectKind.SerializedAttr;
  readonly phase = Phase.ScalarDom;

  constructor(
    readonly element: Element,
    readonly source: Source,
    readonly serializer: AttrSerializer
  ) {}

  run(): void {
    const value = readTrackedSourceValue(this.source);
    const isClass = this.serializer === AttrSerializer.Class;

    if (isClass) {
      const serialized = serializeClass(value as ClassList);
      this.element.setAttribute('class', serialized);
    } else {
      const serialized = stringifyStyle(value);
      this.element.setAttribute('style', serialized);
    }
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

function createDomSubscription(effect: DomEffect, scheduler: Scheduler | undefined): DomSubscriber {
  return registerSubscriberToOwner(new DomSubscription(effect, scheduler ?? getActiveScheduler()));
}

function patchTextValue(text: Text, value: TextExpressionValue | Promise<TextExpressionValue>) {
  if (isPromise(value)) {
    return value.then((resolved) => {
      text.data = String(resolved);
    });
  }

  text.data = String(value);
}

function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}

function getActiveScheduler(): Scheduler {
  return getActiveInvokeContextOrNull()?.container?.scheduler ?? defaultScheduler;
}
