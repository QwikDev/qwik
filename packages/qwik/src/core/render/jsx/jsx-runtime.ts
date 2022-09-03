import type { FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, seal } from '../../util/qdev';
import { logWarn } from '../../util/log';
import { isFunction, isObject, isString } from '../../util/types';
import { qError, QError_invalidJsxNodeType } from '../../error/error';

/**
 * @public
 */
export const jsx = <T extends string | FunctionComponent<PROPS>, PROPS>(
  type: T,
  props: PROPS,
  key?: string | number | null
): JSXNode<T> => {
  if (qDev) {
    if (!isString(type) && !isFunction(type)) {
      throw qError(QError_invalidJsxNodeType, type);
    }
  }
  return new JSXNodeImpl<T>(type, props, key);
};

export const SKIP_RENDER_TYPE = ':skipRender';

export class JSXNodeImpl<T> implements JSXNode<T> {
  constructor(
    public type: T,
    public props: Record<string, any>,
    public key: string | number | null = null
  ) {
    seal(this);
  }
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
