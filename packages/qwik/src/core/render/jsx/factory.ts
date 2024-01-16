/* eslint-disable */
import { jsx } from './jsx-runtime';
import type { QwikJSX as JSX } from './types/jsx-qwik';
import type { FunctionComponent, JSXNode } from './types/jsx-node';
import { isArray } from '../../util/types';

export const flattenArray = <T>(array: (T | T[])[], dst?: T[]): T[] => {
  // Yes this function is just Array.flat, but we need to run on old versions of Node.
  if (!dst) dst = [];
  for (const item of array) {
    if (isArray(item)) {
      flattenArray(item, dst);
    } else {
      dst.push(item);
    }
  }
  return dst;
};

/** @public */
export function h<TYPE extends string | FunctionComponent<PROPS>, PROPS extends {} = {}>(
  type: TYPE,
  props: PROPS | null,
  ...children: any[]
): JSXNode<TYPE> {
  // Using legacy h() jsx transform and morphing it
  // so it can use the modern vdom structure
  // https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
  // https://www.typescriptlang.org/tsconfig#jsxImportSource

  const normalizedProps: any = {
    children: arguments.length > 2 ? flattenArray(children) : undefined,
  };

  let key: any;
  let i: any;

  for (i in props) {
    if (i == 'key') key = (props as Record<string, any>)[i];
    else normalizedProps[i] = (props as Record<string, any>)[i];
  }

  if (typeof type === 'string' && !key && 'dangerouslySetInnerHTML' in normalizedProps) {
    key = 'innerhtml';
  }
  return jsx(type, normalizedProps, key);
}

/** @public */
export declare namespace h {
  export function h(type: any): JSXNode<any>;
  export function h(type: Node, data: any): JSXNode<any>;
  export function h(type: any, text: string): JSXNode<any>;
  export function h(type: any, children: Array<any>): JSXNode<any>;
  export function h(type: any, data: any, text: string): JSXNode<any>;
  export function h(
    type: any,
    data: any,
    children: Array<JSXNode<any> | undefined | null>
  ): JSXNode<any>;
  export function h(sel: any, data: any | null, children: JSXNode<any>): JSXNode<any>;

  export { JSX };
}
