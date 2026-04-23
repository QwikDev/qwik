export const ISDEVTOOL = 'Qwikdevtools';

export const QContainerAttr = 'q:container';

/**
 * A value stored inside a Qwik reactive store proxy.
 * We intentionally keep a narrow union so that `Record<string | symbol, StoreValue>`
 * is assignable without falling back to `any`.
 */
export type StoreValue = string | number | boolean | null | undefined | object;

export type StoreTarget = Record<string | symbol, StoreValue>;

/** Value types that a Qwik VNode prop can hold. */
export type TreeNodePropValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | object;

export type ElementType =
  | 'null'
  | 'boolean'
  | 'number'
  | 'string'
  | 'function'
  | 'array'
  | 'object';

export interface TreeNode {
  name?: string;
  props?: Record<string, TreeNodePropValue>;
  children?: TreeNode[];
  elementType?: ElementType;
  label?: string;
  isHover?: boolean;
  id: string;
}
