import type { DevJSX, FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { filterStack, logError, logWarn } from '../../util/log';
import { isArray, isFunction, isObject, isString } from '../../util/types';
import { qError, QError_invalidJsxNodeType } from '../../error/error';
import { isQrl } from '../../qrl/qrl-class';
import { invoke } from '../../use/use-core';
import { verifySerializable } from '../../state/common';
import { isQwikComponent } from '../../component/component.public';
import { isSignal } from '../../state/signal';
import { isPromise } from '../../util/promises';
import { SkipRender } from './utils.public';

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
        const isQwikC = isQwikComponent(type);
        if (!isString(type) && !isFunction(type)) {
          throw qError(QError_invalidJsxNodeType, String(type));
        }
        if (isArray((props as any).children)) {
          const flatChildren = (props as any).children.flat();
          if (isString(type) || isQwikC) {
            flatChildren.forEach((child: any) => {
              if (!isValidJSXChild(child)) {
                const typeObj = typeof child;
                let explanation = '';
                if (typeObj === 'object') {
                  if (child?.constructor) {
                    explanation = `it's an instance of "${child?.constructor.name}".`;
                  } else {
                    explanation = `it's a object literal: ${printObjectLiteral(child)} `;
                  }
                } else if (typeObj === 'function') {
                  explanation += `it's a function named "${(child as Function).name}".`;
                } else {
                  explanation = `it's a "${typeObj}": ${String(child)}.`;
                }

                throw createJSXError(
                  `One of the children of <${type} /> is not an accepted value. JSX children must be either: string, boolean, number, <element>, Array, undefined/null, or a Promise/Signal that resolves to one of those types. Instead, ${explanation}`,
                  this as any
                );
              }
            });
          }
          const keys: Record<string, boolean> = {};
          flatChildren.forEach((child: any) => {
            if (isJSXNode(child) && !isString(child.type) && child.key != null) {
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
                throw qError(QError_invalidJsxNodeType, String(value));
              }
            }
            if (prop !== 'children' && isQwikC && value) {
              verifySerializable(
                value,
                `The value of the JSX property "${prop}" can not be serialized`
              );
            }
          }
        }
        if (isString(type)) {
          if (type === 'style') {
            if ((props as any).children) {
              logWarn(`jsx: Using <style>{content}</style> will escape the content, effectively breaking the CSS.
In order to disable content escaping use '<style dangerouslySetInnerHTML={content}/>'

However, if the use case is to inject component styleContent, use 'useStyles$()' instead, it will be a lot more efficient.
See https://qwik.builder.io/docs/components/styles/#usestyles for more information.`);
            }
          }
          if (type === 'script') {
            if ((props as any).children) {
              logWarn(`jsx: Using <script>{content}</script> will escape the content, effectively breaking the inlined JS.
In order to disable content escaping use '<script dangerouslySetInnerHTML={content}/>'`);
            }
          }
          if ('className' in (props as any)) {
            (props as any)['class'] = (props as any)['className'];
            delete (props as any)['className'];
            if (qDev && !warnClassname) {
              warnClassname = true;
              logWarn('jsx: `className` is deprecated. Use `class` instead.');
            }
          }
        }
      });
    }
    if (isString(type)) {
      if ('className' in (props as any)) {
        (props as any)['class'] = (props as any)['className'];
        delete (props as any)['className'];
        if (qDev && !warnClassname) {
          warnClassname = true;
          logWarn('jsx: `className` is deprecated. Use `class` instead.');
        }
      }
    }
  }
}

const printObjectLiteral = (obj: Record<string, any>) => {
  return `{ ${Object.keys(obj)
    .map((key) => `"${key}"`)
    .join(', ')} }`;
};

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

export const isValidJSXChild = (node: any): boolean => {
  if (!node) {
    return true;
  } else if (node === SkipRender) {
    return true;
  } else if (isString(node) || typeof node === 'number' || typeof node === 'boolean') {
    return true;
  } else if (isJSXNode(node)) {
    return true;
  }
  if (isSignal(node)) {
    return isValidJSXChild(node.value);
  } else if (isPromise(node)) {
    return true;
  }
  return false;
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

export const createJSXError = (message: string, node: JSXNode) => {
  const error = new Error(message);
  if (!node.dev) {
    return error;
  }
  const id = node.dev.fileName;
  const key = `${message}${id}:${node.dev.lineNumber}:${node.dev.columnNumber}`;
  if (ONCE_JSX.has(key)) {
    return undefined;
  }
  Object.assign(error, {
    id,
    loc: {
      file: id,
      column: node.dev.columnNumber,
      line: node.dev.lineNumber,
    },
  });
  error.stack = `JSXError: ${message}\n${filterStack(node.dev.stack!, 1)}`;
  ONCE_JSX.add(key);
  return error;
};

export { jsx as jsxs };
