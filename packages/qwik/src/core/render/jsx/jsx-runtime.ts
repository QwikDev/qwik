import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev } from '../../util/qdev';
import { logWarn } from '../../util/log';
import { isObject } from '../../util/types';

/**
 * @public
 */
export const jsx = <T extends string | FunctionComponent<PROPS>, PROPS>(
  type: T,
  props: PROPS,
  key?: string | number
): JSXNode<T> => {
  return new JSXNodeImpl<T>(type, props, key);
};

export const HOST_TYPE = ':host';
export const SKIP_RENDER_TYPE = ':skipRender';

export class JSXNodeImpl<T> implements JSXNode<T> {
  constructor(
    public type: T,
    public props: Record<string, any>,
    public key: string | number | null = null
  ) {}
}

export const isJSXNode = (n: any): n is JSXNode<unknown> => {
  if (qDev) {
    if (n instanceof JSXNodeImpl) {
      return true;
    }
    if (isObject(n) && 'key' in n && 'props' in n && 'type' in n) {
      logWarn(`Duplicate implementations of "JSXNode" found`);
      return true;
    }
    return false;
  } else {
    return n instanceof JSXNodeImpl;
  }
};
/**
 * @public
 */
export const Fragment: FunctionComponent<{ children?: any }> = (props) => props.children as any;

export type { QwikJSX as JSX };

export { jsx as jsxs, jsx as jsxDEV };
