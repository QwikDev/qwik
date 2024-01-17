import type { JSXChildren } from './jsx-qwik-attributes';

/**
 * Any valid output for a component
 *
 * @public
 */
export type JSXOutput = JSXNode | string | number | boolean | null | undefined | JSXOutput[];

/**
 * Any sync or async function that returns JSXOutput.
 *
 * Note that this includes QRLs.
 *
 * The `key`, `flags` and `dev` parameters are for internal use.
 *
 * @public
 */
export type FunctionComponent<P extends Record<any, any> = Record<any, unknown>> = {
  renderFn(
    props: P,
    key: string | null,
    flags: number,
    dev?: DevJSX
  ): JSXOutput | Promise<JSXOutput>;
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
  props: T extends FunctionComponent<infer B> ? B : Record<any, unknown>;
  immutableProps: Record<any, unknown> | null;
  children: JSXChildren | null;
  flags: number;
  key: string | null;
  dev?: DevJSX;
}
