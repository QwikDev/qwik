import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { ClassList } from '../../shared/jsx/types/jsx-qwik-attributes';
import type { Container } from '../../shared/types';
import { serializeClass, stringifyStyle } from '../../shared/utils/styles';
import { ReactiveFlags } from './flags';
import { defaultScheduler, Phase, type Scheduler } from './scheduler';
import { SubscriberKind, type DomSubscriber } from './subscriber';
import { readSourceValue, type Dependency, type Source } from './source';
import { track } from './tracking';

export const enum DomEffectKind {
  TextExpression = 0,
  TextNode = 1,
  Attr = 2,
  SerializedAttr = 3,
}

export const enum AttrSerializer {
  Class = 0,
  Style = 1,
}

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => TextExpressionValue;
export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  TextExpressionFn<TArgs>
>;

export interface DomEffectOptions {
  phase?: Phase.StructuralDom | Phase.ScalarDom;
  order?: number;
  scheduler?: Scheduler;
}

export interface TextExpressionOptions extends DomEffectOptions {
  container?: Container;
}

export type DomEffect =
  | TextExpressionEffect<any[]>
  | TextNodeEffect
  | AttrEffect
  | SerializedAttrEffect;

export class TextExpressionEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = DomEffectKind.TextExpression;

  constructor(
    readonly text: Text,
    readonly args: TArgs,
    readonly fn: TextExpressionFn<TArgs> | undefined,
    readonly qrl: TextExpressionQrl<TArgs> | undefined,
    readonly phase: Phase.StructuralDom | Phase.ScalarDom,
    readonly order: number,
    readonly container?: Container
  ) {}

  run(): unknown {
    return runTextExpressionEffect(this);
  }
}

export class TextNodeEffect {
  readonly kind = DomEffectKind.TextNode;

  constructor(
    readonly text: Text,
    readonly source: Source,
    readonly phase: Phase.StructuralDom | Phase.ScalarDom,
    readonly order: number
  ) {}

  run(): void {
    this.text.data = String(readTrackedSourceValue(this.source));
  }
}

export class AttrEffect {
  readonly kind = DomEffectKind.Attr;

  constructor(
    readonly element: Element,
    readonly name: string,
    readonly source: Source,
    readonly phase: Phase.StructuralDom | Phase.ScalarDom,
    readonly order: number
  ) {}

  run(): void {
    this.element.setAttribute(this.name, String(readTrackedSourceValue(this.source)));
  }
}

export class SerializedAttrEffect {
  readonly kind = DomEffectKind.SerializedAttr;

  constructor(
    readonly element: Element,
    readonly name: 'class' | 'style',
    readonly source: Source,
    readonly serializer: AttrSerializer,
    readonly phase: Phase.StructuralDom | Phase.ScalarDom,
    readonly order: number
  ) {}

  run(): void {
    const value = readTrackedSourceValue(this.source);
    const serialized =
      this.serializer === AttrSerializer.Class
        ? serializeClass(value as ClassList)
        : stringifyStyle(value);

    this.element.setAttribute(this.name, serialized);
  }
}

export class DomSubscription implements DomSubscriber {
  readonly kind = SubscriberKind.Dom;
  flags = ReactiveFlags.None;
  schedulerEpoch = 0;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly effect: DomEffect,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  notify(): void {
    this.scheduler.notify(this);
  }
}

export function createTextExpressionEffect<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  fn: TextExpressionFn<TArgs>,
  options?: TextExpressionOptions
): DomSubscriber {
  return new DomSubscription(
    createTextExpressionRecord(text, args, fn, undefined, false, options),
    options?.scheduler
  );
}

export function createTextExpressionEffectQrl<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>,
  options?: TextExpressionOptions
): DomSubscriber {
  return new DomSubscription(
    createTextExpressionRecord(text, args, undefined, qrl, true, options),
    options?.scheduler
  );
}

export function createTextNodeEffect(
  text: Text,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return new DomSubscription(
    new TextNodeEffect(text, source, options?.phase ?? Phase.ScalarDom, options?.order ?? 0),
    options?.scheduler
  );
}

export function createAttrEffect(
  element: Element,
  name: string,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return new DomSubscription(
    new AttrEffect(element, name, source, options?.phase ?? Phase.ScalarDom, options?.order ?? 0),
    options?.scheduler
  );
}

export function createClassEffect(
  element: Element,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return new DomSubscription(
    new SerializedAttrEffect(
      element,
      'class',
      source,
      AttrSerializer.Class,
      options?.phase ?? Phase.ScalarDom,
      options?.order ?? 0
    ),
    options?.scheduler
  );
}

export function createStyleEffect(
  element: Element,
  source: Source,
  options?: DomEffectOptions
): DomSubscriber {
  return new DomSubscription(
    new SerializedAttrEffect(
      element,
      'style',
      source,
      AttrSerializer.Style,
      options?.phase ?? Phase.ScalarDom,
      options?.order ?? 0
    ),
    options?.scheduler
  );
}

function createTextExpressionRecord<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  fn: TextExpressionFn<TArgs> | undefined,
  qrl: TextExpressionQrl<TArgs> | undefined,
  isQrl: boolean,
  options: TextExpressionOptions | undefined
): TextExpressionEffect<TArgs> {
  return new TextExpressionEffect(
    text,
    args,
    fn,
    qrl,
    options?.phase ?? (isQrl ? Phase.StructuralDom : Phase.ScalarDom),
    options?.order ?? 0,
    options?.container
  );
}

function runTextExpressionEffect<TArgs extends unknown[]>(
  effect: TextExpressionEffect<TArgs>
): unknown {
  if (effect.fn !== undefined) {
    return patchTextValue(effect.text, effect.fn(...effect.args));
  }

  const qrl = effect.qrl!;
  const resolved = qrl.resolved;
  if (resolved !== undefined) {
    return patchTextValue(effect.text, resolved(...effect.args));
  }

  return qrl.resolve(effect.container).then((fn) => {
    return patchTextValue(effect.text, fn(...effect.args));
  });
}

function patchTextValue(text: Text, value: TextExpressionValue | Promise<TextExpressionValue>) {
  if (isPromiseLike(value)) {
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

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}
