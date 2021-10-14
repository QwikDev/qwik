import { _qObject } from './q-object';

/**
 * @public
 */
export type QObject<T extends {}> = T & { __brand__: 'QObject' };

/**
 * @public
 */
export function qObject<T>(obj: T): QObject<T> {
  return _qObject<T>(obj) as any;
}
