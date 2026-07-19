import { readSourceValue, type Source } from '../../reactive/source';
import { track } from '../../reactive/tracking';
import type { Scheduler } from '../../runtime/scheduler';
import type { DomSubscriber } from '../../runtime/subscriber';
import { isPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { commitDomPromise, createDomSubscription } from './dom-subscription';

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<TextExpressionValue>;

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
