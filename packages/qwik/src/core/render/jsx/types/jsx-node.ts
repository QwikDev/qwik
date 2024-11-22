import type { JSXChildren } from './jsx-qwik-attributes';

/**
 * Any valid output for a component
 *
 * @public
 */
export type JSXOutput = JSXNode | string | number | boolean | null | undefined | JSXOutput[];

/**
 * Any function taking a props object that returns JSXOutput.
 *
 * The `key`, `flags` and `dev` parameters are for internal use.
 *
 * @public
 */
export type FunctionComponent<P = unknown> = {
  renderFn(props: P, key: string | null, flags: number, dev?: DevJSX): JSXOutput;
}['renderFn'];

/** @public */
export interface DevJSX {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  stack?: string;
}

/**
 * A JSX Node, an internal structure. You probably want to use `JSXOutput` instead.
 *
 * @public
 */
export interface JSXNode<T extends string | FunctionComponent | unknown = unknown> {
  type: T;
  props: T extends FunctionComponent<infer P> ? P : Record<any, unknown>;
  children: JSXChildren | null;
  key: string | null;
  dev?: DevJSX;
}

/**
 * The internal representation of a JSX node.
 *
 * @internal
 */
export interface JSXNodeInternal<T extends string | FunctionComponent | unknown = unknown>
  extends JSXNode<T> {
  immutableProps: Record<any, unknown> | null;
  flags: number;
}
