/**
 * @public
 */
export interface FunctionComponent<P = Record<string, any>> {
  (props: P, key: string | null): JSXNode | null;
}

/**
 * @public
 */
export interface JSXNode<T = string | FunctionComponent> {
  type: T;
  props: T extends FunctionComponent<infer B> ? B : Record<string, any>;
  key: string | null;
}
