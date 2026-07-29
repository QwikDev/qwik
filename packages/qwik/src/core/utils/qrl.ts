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
 * Calls an expression QRL that must produce a value synchronously, passing its captures as the
 * positional arguments the segment ABI expects. A pending chunk is thrown so the enclosing
 * `retryOnPromise` re-runs once it resolves.
 */
export function readExpression<T>(
  qrl: QRL<(...captures: unknown[]) => T>,
  ctx?: ContainerContext
): T {
  const fn = getFunctionOrResolve(qrl, ctx);
  if (isPromise(fn)) {
    throw fn;
  }
  const captures = (qrl as QRLInternal<(...captures: unknown[]) => T>).getCaptured() ?? [];
  return fn(...captures);
}
