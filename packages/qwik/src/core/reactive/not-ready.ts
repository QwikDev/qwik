import type { Computed } from './computed';

const notReadyErrors = new WeakSet<object>();

/** Thrown by a read when nothing can compute a value now, e.g. a cancelled loader. */
export class NotReadyError extends Error {
  constructor(readonly source: Pick<Computed<unknown>, 'whenSettled'>) {
    super('Computed value is not ready');
    notReadyErrors.add(this);
  }
}

/** Safe for any thrown value, revoked proxies included. */
export const isNotReadyError = (error: unknown): error is NotReadyError =>
  notReadyErrors.has(error as object);
