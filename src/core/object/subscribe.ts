import { assertDefined } from '../assert/assert';
import { getInvokeContext } from '../use/use-core';
import type { QObject } from './q-object';

export function subscribe<T extends QObject<any>>(qObject: T, ...rest: QObject<any>[]): T;
export function subscribe(...qObjects: QObject<any>[]): any {
  assertDefined(
    getInvokeContext().subscriptions,
    'Invoking of `subscribe()` outside of `use*()` context of `onRender`.'
  );
  qObjects.forEach((v) => getInvokeContext().subscriptions!.add(v));
  return qObjects[0];
}
