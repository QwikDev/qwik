import type { QObject } from '..';
import { _qSubscribe } from '../use/use-core.public';

/**
 * @public
 */
export function qSubscribe<T extends QObject<any>>(qObject: T, ...rest: QObject<any>[]): T;
/**
 * @public
 */
export function qSubscribe(...qObjects: QObject<any>[]): any {
  _qSubscribe(qObjects);
  return qObjects[0];
}
