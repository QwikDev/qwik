/** Any valid source-level output for a component. @public */
export type JSXOutput = string | number | boolean | null | undefined | JSXOutput[];

/** Any source component taking a props object and returning JSX output. @public */
export type FunctionComponent<P = unknown> = {
  bivarianceHack(props: P): JSXOutput;
}['bivarianceHack'];

/** @public */
export interface DevJSX {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  stack?: string;
}
