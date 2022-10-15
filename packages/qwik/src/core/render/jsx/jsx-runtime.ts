import type { DevJSX, FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { logWarn } from '../../util/log';
import { isFunction, isObject, isString } from '../../util/types';
import { qError, QError_invalidJsxNodeType } from '../../error/error';
import { isQrl } from '../../qrl/qrl-class';

/**
 * @public
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key?: string | number | null
): JSXNode<T> => {
  if (qDev) {
    if (!isString(type) && !isFunction(type)) {
      throw qError(QError_invalidJsxNodeType, type);
    }
    if (!qRuntimeQrl && props) {
      for (const prop of Object.keys(props)) {
        if (prop.endsWith('$') && !isQrl(props[prop])) {
          throw qError(QError_invalidJsxNodeType, type);
        }
      }
    }
  }
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl<T>(type, props, processed);
  seal(node);
  return node;
};

export const SKIP_RENDER_TYPE = ':skipRender';

export class JSXNodeImpl<T> implements JSXNode<T> {
  dev?: DevJSX;
  constructor(
    public type: T,
    public props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
    public key: string | null = null
  ) {}
}

export const isJSXNode = (n: any): n is JSXNode => {
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

interface JsxDevOpts {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * @public
 */
export const jsxDEV = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key: string | number | null | undefined,
  isStatic: boolean,
  opts: JsxDevOpts,
  ctx: any
): JSXNode<T> => {
  if (qDev) {
    if (!isString(type) && !isFunction(type)) {
      throw qError(QError_invalidJsxNodeType, type);
    }
  }
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl<T>(type, props, processed);
  node.dev = {
    isStatic,
    ctx,
    ...opts,
  };
  seal(node);
  return node;
};

export type { QwikJSX as JSX };

export { jsx as jsxs };
