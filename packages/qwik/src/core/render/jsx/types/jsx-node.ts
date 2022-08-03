/**
 * @public
 */
export interface FunctionComponent<P = {}> {
  (props: P, key?: string): JSXNode | null;
}

/**
 * @public
 */
export interface JSXNode<T = any> {
  type: T;
  props: Record<string, any>;
  key: string | number | null;
}
