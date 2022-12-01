import type { DevJSX, FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { filterStack, logError, logWarn } from '../../util/log';
import { isArray, isFunction, isObject, isString } from '../../util/types';
import { qError, QError_invalidJsxNodeType } from '../../error/error';
import { isQrl } from '../../qrl/qrl-class';
import { invoke } from '../../use/use-core';

let warnClassname = false;

/**
 * @public
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key?: string | number | null
): JSXNode<T> => {
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
  ) {
    if (qDev) {
      invoke(undefined, () => {
        if (!isString(type) && !isFunction(type)) {
          throw qError(QError_invalidJsxNodeType, type);
        }
        if (isArray((props as any).children)) {
          const keys: Record<string, boolean> = {};
          (props as any).children.flat().forEach((child: any) => {
            if (isJSXNode(child) && child.key != null) {
              if (keys[child.key]) {
                const err = createJSXError(
                  `Multiple JSX sibling nodes with the same key.\nThis is likely caused by missing a custom key in a for loop`,
                  child
                );
                if (err) {
                  logError(err);
                }
              } else {
                keys[child.key] = true;
              }
            }
          });
        }
        if (!qRuntimeQrl && props) {
          for (const prop of Object.keys(props)) {
            const value = (props as any)[prop];
            if (prop.endsWith('$') && value) {
              if (!isQrl(value) && !Array.isArray(value)) {
                throw qError(QError_invalidJsxNodeType, type);
              }
            }
          }
        }
      });
    }
    if (typeof type === 'string' && 'className' in (props as any)) {
      (props as any)['class'] = (props as any)['className'];
      delete (props as any)['className'];
      if (qDev && !warnClassname) {
        warnClassname = true;
        logWarn('jsx: `className` is deprecated. Use `class` instead.');
      }
    }
  }
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
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl<T>(type, props, processed);
  node.dev = {
    isStatic,
    ctx,
    stack: new Error().stack,
    ...opts,
  };
  seal(node);
  return node;
};

export type { QwikJSX as JSX };

const ONCE_JSX = new Set<string>();

const createJSXError = (message: string, node: JSXNode) => {
  if (!node.dev) {
    return undefined;
  }
  const key = `${message}${node.dev.fileName}:${node.dev.lineNumber}:${node.dev.columnNumber}`;
  if (ONCE_JSX.has(key)) {
    return undefined;
  }
  const error = new Error(message);
  const name = isFunction(node.type) ? node.type.name : String(node.type);
  error.stack = `JSXError: ${message}\n    at <${name}> (${node.dev.fileName}:${
    node.dev.lineNumber
  }:${node.dev.columnNumber})\n${filterStack(node.dev.stack!, 1)}`;
  ONCE_JSX.add(key);
  return error;
};

export { jsx as jsxs };
