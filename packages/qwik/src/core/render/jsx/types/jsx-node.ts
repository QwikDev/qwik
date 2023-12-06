import type { JSXChildren } from './jsx-qwik-attributes';

/** @public */
export interface FunctionComponent<P extends Record<any, any> = Record<any, unknown>> {
  (props: P, key: string | null, flags: number, dev?: DevJSX): JSXNode | null;
}
/** @public */
export interface DevJSX {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  stack?: string;
}

/** @public */
export interface JSXNode<T = string | FunctionComponent> {
  type: T;
  props: T extends FunctionComponent<infer B> ? B : Record<any, unknown>;
  immutableProps: Record<any, unknown> | null;
  children: JSXChildren | null;
  flags: number;
  key: string | null;
  dev?: DevJSX;
}
