/**
 * @public
 */
export type ComponentChild =
  | JSXNode<any>
  | object
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined;

/**
 * @public
 */
export type ComponentChildren = ComponentChild[] | ComponentChild;

/**
 * @public
 */
export type RenderableProps<
  P,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RefType = any
> = P & Readonly<{ children?: ComponentChildren }>;

/**
 * @public
 */
export interface FunctionComponent<P = {}> {
  (props: P): JSXNode<any> | null;
}

/**
 * @public
 */
export interface JSXNode<PROPS = any> {
  type: any;
  props: PROPS;
  children: ComponentChild[];
  key: string | number | any;
}

/**
 * @public
 */
export type JSXFactory<PROPS extends {} = any> = (props: PROPS, state?: any) => JSXNode<PROPS>;
