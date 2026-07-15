import type { ValueOrPromise } from './types';

/** @public */
export interface StreamWriter {
  write(chunk: string): ValueOrPromise<void>;
  waitForDrain?(): ValueOrPromise<void>;
}
