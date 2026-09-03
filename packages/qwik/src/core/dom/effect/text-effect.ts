import { _textValue } from '../../shared/utils/character-escaping';
import { readSourceValue, type Source } from '../../reactive/source';
import { track } from '../../reactive/tracking';
import type { Scheduler } from '../../runtime/scheduler';
import { isPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { commitDomPromise, DomEffect, registerDomEffect } from './dom-effect';

export type TextExpressionValue = string | number | boolean | bigint | null | undefined;
export type TextExpressionFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<TextExpressionValue>;

export class TextExpressionEffect<TArgs extends unknown[] = unknown[]> extends DomEffect {
  constructor(
    readonly text: Text,
    readonly args: TArgs,
    readonly fn: TextExpressionFn<TArgs>,
    scheduler?: Scheduler
  ) {
    super(scheduler);
  }

  execute(): ValueOrPromise<void> {
    return patchTextValue(this.text, this.fn(...this.args));
  }
}

export class TextNodeEffect extends DomEffect {
  constructor(
    readonly text: Text,
    readonly source: Source<ValueOrPromise<TextExpressionValue>>,
    scheduler?: Scheduler,
    /** Concat operands keep JS `String()` coercion; JSX positions suppress nullish/booleans. */
    readonly stringify: boolean = false
  ) {
    super(scheduler);
  }

  execute(): ValueOrPromise<void> {
    return patchTextValue(this.text, readTrackedSourceValue(this.source), this.stringify);
  }
}

export function createTextExpressionEffect<TArgs extends unknown[]>(
  text: Text,
  args: TArgs,
  fn: TextExpressionFn<TArgs>,
  scheduler?: Scheduler
): TextExpressionEffect<TArgs> {
  return registerDomEffect(new TextExpressionEffect(text, args, fn, scheduler));
}

export function createTextNodeEffect(
  text: Text,
  source: Source<ValueOrPromise<TextExpressionValue>>,
  scheduler?: Scheduler,
  stringify?: boolean
): TextNodeEffect {
  return registerDomEffect(new TextNodeEffect(text, source, scheduler, stringify));
}

export function patchTextValue(
  text: Text,
  value: TextExpressionValue | Promise<TextExpressionValue>,
  stringify = false
): ValueOrPromise<void> {
  if (isPromise(value)) {
    return commitDomPromise(value, (resolved) => {
      setTextData(text, resolved, stringify);
    });
  }

  setTextData(text, value, stringify);
}

function setTextData(text: Text, value: TextExpressionValue, stringify: boolean): void {
  text.data = stringify ? String(value) : _textValue(value);
}

export function readTrackedSourceValue<T>(source: Source<T>): T {
  track(source);
  return readSourceValue(source);
}
