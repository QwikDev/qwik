import type { QRLInternal } from '../import/qrl-class';
import { qrlImport } from '../import/qrl.public';
import { getContext, getEvent } from '../props/props';
import type { Props } from '../props/props.public';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { logError } from '../util/log';
import type { Observer } from './watch.public';

export type CleanupFn = () => void;
export type WatchFn = (obs: Observer) => unknown | CleanupFn;
export type OnWatchHandler = (qObjectId: string, propName: string) => Promise<unknown>;

const ON_WATCH = 'on:qWatch';

export function registerOnWatch(element: Element, props: Props, watchFnQrl: QRLInternal<WatchFn>) {
  props[ON_WATCH] = watchFnQrl;
  invokeWatchFn(element, watchFnQrl);
}

const cleanupFnMap = new Map<WatchFn, CleanupFn>();

export async function invokeWatchFn(element: Element, watchFnQrl: QRLInternal<WatchFn>) {
  const watchFn = await qrlImport(element, watchFnQrl);
  const previousCleanupFn = cleanupFnMap.get(watchFn);
  cleanupFnMap.delete(watchFn);
  if (isCleanupFn(previousCleanupFn)) {
    try {
      previousCleanupFn();
    } catch (e) {
      // TODO(misko): Centralize error handling
      logError(e);
    }
  }
  throw new Error('TO IMPLEMENT');
}
function isCleanupFn(value: any): value is CleanupFn {
  return typeof value === 'function';
}

export async function notifyWatchers(
  element: Element,
  qObjectId: string,
  propName: string
): Promise<void> {
  const ctx = getContext(element);
  const onWatch: null | OnWatchHandler = getEvent(ctx, 'on:qWatch');
  if (onWatch) {
    try {
      // TODO
      const context = newInvokeContext(element, element);
      context.qrlGuard = (qrl: QRLInternal) => {
        const props = qrl.guard?.get(qObjectId);
        return props ? props.indexOf(propName) !== -1 : false;
      };
      await useInvoke(context, onWatch, qObjectId, propName);
    } catch (e) {
      logError(e);
    }
  }
}
