import { EMPTY_ARRAY } from '../../util/flyweight';
import type { ComponentChild, FunctionalComponent, JSXInternal, JSXNode } from './types';

/**
 * @public
 */
export function jsx(
  type: string | FunctionalComponent,
  props: JSXInternal.SVGAttributes &
    JSXInternal.HTMLAttributes &
    Record<string, any> & { children?: ComponentChild[] },
  key?: string
) {
  return new JSXNodeImpl(type, props, key);
}

class JSXNodeImpl<T> implements JSXNode<T> {
  children: any;

  constructor(public type: T, public props: any, public key: any) {
    if (props && props.children) {
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

export const isJSXNode = (n: any): n is JSXNode<unknown> => n instanceof JSXNodeImpl;

/**
 * @public
 */
export const Fragment = {} as any;

export { JSXInternal as JSX };
export { JSXInternal };

export { jsx as jsxs, jsx as jsxDEV };
