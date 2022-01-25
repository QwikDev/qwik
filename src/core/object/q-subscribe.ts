import { assertDefined } from '../assert/assert';
import { getInvokeContext } from '../use/use-core';
import type { QObject } from './q-object';

export function qSubscribe<T extends QObject<any>>(qObject: T, ...rest: QObject<any>[]): T;
export function qSubscribe(...qObjects: QObject<any>[]): any {
  assertDefined(
    getInvokeContext().subscriptions,
    'Invoking of `qSubscribe()` outside of `use*()` context of `onRender`.'
  );
  qObjects.forEach((v) => getInvokeContext().subscriptions!.add(v));
  return qObjects[0];
}
