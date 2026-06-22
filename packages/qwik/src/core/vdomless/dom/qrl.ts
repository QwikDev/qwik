import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import { isQrl } from '../../shared/qrl/qrl-utils';
import type { ContainerContext } from '../runtime/container-context';

export function getFunctionOrResolve<T>(fn: T | QRL<T>, ctx?: ContainerContext): T | Promise<T> {
  return isQrl(fn)
    ? (((fn as QRLInternal<T>).resolved ?? fn.resolve(ctx)) as T | Promise<T>)
    : (fn as T);
}
