import { hydrateIfNeeded, newQProps, Q_PROP } from './q-props';

/**
 * @public
 */
export type QProps<T extends {} = {}> = Record<string, any> & T;

/**
 * @public
 */
export function qProps<T>(element: Element): QProps<T> {
  hydrateIfNeeded(element);
  let qProps = (element as any)[Q_PROP];
  if (!qProps) {
    qProps = newQProps(element);
  }
  return qProps;
}
