import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { isQrl } from '../shared/qrl/qrl-utils';
import { isPromise } from '../shared/utils/promises';
import type { ContainerContext } from '../runtime/container-context';

export function getFunctionOrResolve<T>(
  fn: T | QRL<T>,
  ctx?: ContainerContext,
  bindCaptures = true
): T | Promise<T> {
  if (!isQrl(fn)) {
    return fn as T;
  }
  const qrl = fn as QRLInternal<T>;
  if (qrl.resolved != null) {
    return qrl.resolved;
  }
  const loaded = qrl.$lazy$.$ref$;
  if (!bindCaptures && loaded != null && !isPromise(loaded) && typeof qrl.$captures$ !== 'string') {
    return loaded;
  }
  return qrl.resolve(ctx, bindCaptures);
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
  const captures = (qrl as QRLInternal<(...captures: unknown[]) => T>).getCaptured();
  if (isPromise(captures)) {
    throw captures;
  }
  return fn(...(captures ?? []));
}
