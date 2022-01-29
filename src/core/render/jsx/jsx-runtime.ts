import { EMPTY_ARRAY } from '../../util/flyweight';
import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev } from '../../util/qdev';

/**
 * @public
 */
export function jsx<T extends string | FunctionComponent<PROPS>, PROPS>(
  type: T,
  props: PROPS,
  key?: string
): JSXNode<T> {
  return new JSXNodeImpl(type, props, key);
}

export class JSXNodeImpl<T> implements JSXNode<T> {
  children: any;

  constructor(public type: T, public props: any, public key: any) {
    if (props && props.children !== undefined) {
      if (Array.isArray(props.children)) {
        this.children = props.children;
      } else {
        this.children = [props.children];
      }
    } else {
      this.children = EMPTY_ARRAY;
    }
  }
}

export const isJSXNode = (n: any): n is JSXNode<unknown> => {
  if (qDev) {
    if (n instanceof JSXNodeImpl) {
      return true;
    }
    if (n && typeof n === 'object' && n.constructor.name === JSXNodeImpl.name) {
      throw new Error(`Duplicate implementations of "JSXNodeImpl" found`);
    }
    return false;
  } else {
    return n instanceof JSXNodeImpl;
  }
};

/**
 * @public
 */
export const Fragment = {} as any;

export type { QwikJSX as JSX };

export { jsx as jsxs, jsx as jsxDEV };
