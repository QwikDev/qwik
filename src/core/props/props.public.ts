/**
 * @public
 */
export type Props<T extends {} = {}> = Record<string, any> & T;

/**
 * @public
 */
export function getCtxProxy<T>(_: Element): Props<T> {
  return {} as any;
}
