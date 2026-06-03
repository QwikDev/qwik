import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { ReactiveFlags } from './flags';
import { defaultScheduler, Phase, type Scheduler } from './scheduler';
import { SubscriberKind, type DomSubscriber } from './subscriber';
import type { Dependency } from './source';

export const enum DomEffectKind {
  TextExpression = 0,
}

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => TextExpressionValue;
export type TextExpressionQrl<TArgs extends unknown[] = unknown[]> = QRLInternal<
  TextExpressionFn<TArgs>
>;

export interface TextExpressionOptions {
  phase?: Phase.StructuralDom | Phase.ScalarDom;
  order?: number;
  scheduler?: Scheduler;
  container?: Container;
}

export type DomEffect = TextExpressionEffect<any[]>;

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
  return new DomSubscription(createTextExpressionRecord(text, args, fn, undefined, false, options));
}

export function createTextExpressionEffectQrl<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  qrl: TextExpressionQrl<TArgs>,
  options?: TextExpressionOptions
): DomSubscriber {
  return new DomSubscription(createTextExpressionRecord(text, args, undefined, qrl, true, options));
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

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}
