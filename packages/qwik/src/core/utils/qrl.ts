import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { isQrl } from '../shared/qrl/qrl-utils';
import { isPromise } from '../shared/utils/promises';
import type { ContainerContext } from '../runtime/container-context';

export function getFunctionOrResolve<T>(fn: T | QRL<T>, ctx?: ContainerContext): T | Promise<T> {
  return isQrl(fn)
    ? (((fn as QRLInternal<T>).resolved ?? fn.resolve(ctx)) as T | Promise<T>)
    : (fn as T);
}

/**
 * Calls a QRL that must produce a value synchronously. A pending chunk is thrown so the enclosing
 * `retryOnPromise` re-runs once it resolves.
 */
export function readExpression<T>(qrl: QRL<() => T>, ctx?: ContainerContext): T {
  const fn = getFunctionOrResolve(qrl, ctx);
  if (isPromise(fn)) {
    throw fn;
  }
  return fn();
}
