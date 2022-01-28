import { hydrateIfNeeded, newQProps, Q_PROP } from './props';

/**
 * @public
 */
export type Props<T extends {} = {}> = Record<string, any> & T;

/**
 * @public
 */
export function getProps<T>(element: Element): Props<T> {
  hydrateIfNeeded(element);
  let getProps = (element as any)[Q_PROP];
  if (!getProps) {
    getProps = newQProps(element);
  }
  return getProps;
}
