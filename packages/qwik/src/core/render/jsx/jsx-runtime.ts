import type { DevJSX, FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { logOnceWarn, logWarn } from '../../util/log';
import { isArray, isFunction, isObject, isString } from '../../util/types';
import { isQrl } from '../../qrl/qrl-class';
import { invoke, untrack } from '../../use/use-core';
import { verifySerializable } from '../../state/common';
import { isQwikComponent } from '../../component/component.public';
import { isSignal } from '../../state/signal';
import { isPromise } from '../../util/promises';
import { SkipRender } from './utils.public';
import { EMPTY_OBJ } from '../../util/flyweight';
import { _IMMUTABLE } from '../../internal';
import { isBrowser } from '@builder.io/qwik/build';

/**
 * @internal
 */
export const _jsxQ = <T extends string | FunctionComponent<any>>(
  type: T,
  mutableProps: (T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>) | null,
  immutableProps: Record<string, any> | null,
  children: any | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl<T>(
    type,
    mutableProps ?? (EMPTY_OBJ as any),
    immutableProps,
    children,
    flags,
    processed
  );
  if (qDev && dev) {
    node.dev = {
      stack: new Error().stack,
      ...dev,
    };
  }
  seal(node);
  return node;
};

/**
 * @internal
 */
export const _jsxC = <T extends string | FunctionComponent<any>>(
  type: T,
  mutableProps: (T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>) | null,
  flags: number,
  key: string | number | null,
  dev?: JsxDevOpts
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const props = mutableProps ?? (EMPTY_OBJ as any);
  const node = new JSXNodeImpl<T>(type, props, null, props.children, flags, processed);
  if (typeof type === 'string' && mutableProps) {
    delete mutableProps.children;
  }
  if (qDev && dev) {
    node.dev = {
      stack: new Error().stack,
      ...dev,
    };
  }
  seal(node);
  return node;
};

/**
 * @public
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
  key?: string | number | null
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const children = untrack(() => {
    const c = props.children;
    if (typeof type === 'string') {
      delete props.children;
    }
    return c;
  });
  if (isString(type)) {
    if ('className' in (props as any)) {
      (props as any)['class'] = (props as any)['className'];
      delete (props as any)['className'];
      if (qDev) {
        logOnceWarn('jsx: `className` is deprecated. Use `class` instead.');
      }
    }
  }
  const node = new JSXNodeImpl<T>(type, props, null, children, 0, processed);
  seal(node);
  return node;
};

export const SKIP_RENDER_TYPE = ':skipRender';

export class JSXNodeImpl<T> implements JSXNode<T> {
  dev?: DevJSX;
  constructor(
    public type: T,
    public props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<string, any>,
    public immutableProps: Record<string, any> | null,
    public children: any | null,
    public flags: number,
    public key: string | null = null
  ) {
    if (qDev) {
      invoke(undefined, () => {
        const isQwikC = isQwikComponent(type);
        if (!isString(type) && !isFunction(type)) {
          throw createJSXError(
            `The <Type> of the JSX element must be either a string or a function. Instead, it's a "${typeof type}": ${String(
              type
            )}.`,
            this as any
          );
        }
        if (children) {
          const flatChildren = isArray(children) ? children.flat() : [children];
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
                  `One of the children of <${type}> is not an accepted value. JSX children must be either: string, boolean, number, <element>, Array, undefined/null, or a Promise/Signal. Instead, ${explanation}\n`,
                  this as any
                );
              }
            });
          }
          if (isBrowser) {
            if (isFunction(type) || immutableProps) {
              const keys: Record<string, boolean> = {};
              flatChildren.forEach((child: any) => {
                if (isJSXNode(child) && child.key != null) {
                  const key = String(child.type) + ':' + child.key;
                  if (keys[key]) {
                    const err = createJSXError(
                      `Multiple JSX sibling nodes with the same key.\nThis is likely caused by missing a custom key in a for loop`,
                      child
                    );
                    if (err) {
                      if (isString(child.type)) {
                        logOnceWarn(err);
                      } else {
                        logOnceWarn(err);
                      }
                    }
                  } else {
                    keys[key] = true;
                  }
                }
              });
            }
          }
        }
        if (!qRuntimeQrl && props) {
          for (const prop of Object.keys(props)) {
            const value = (props as any)[prop];
            if (prop.endsWith('$') && value) {
              if (!isQrl(value) && !Array.isArray(value)) {
                throw createJSXError(
                  `The value passed in ${prop}={...}> must be a QRL, instead you passed a "${typeof value}". Make sure your ${typeof value} is wrapped with $(...), so it can be serialized. Like this:\n$(${String(
                    value
                  )})`,
                  this as any
                );
              }
            }
            if (prop !== 'children' && isQwikC && value) {
              verifySerializable(
                value,
                `The value of the JSX attribute "${prop}" can not be serialized`
              );
            }
          }
        }
        if (isString(type)) {
          if (type === 'style') {
            if (children) {
              logOnceWarn(`jsx: Using <style>{content}</style> will escape the content, effectively breaking the CSS.
In order to disable content escaping use '<style dangerouslySetInnerHTML={content}/>'

However, if the use case is to inject component styleContent, use 'useStyles$()' instead, it will be a lot more efficient.
See https://qwik.builder.io/docs/components/styles/#usestyles for more information.`);
            }
          }
          if (type === 'script') {
            if (children) {
              logOnceWarn(`jsx: Using <script>{content}</script> will escape the content, effectively breaking the inlined JS.
In order to disable content escaping use '<script dangerouslySetInnerHTML={content}/>'`);
            }
          }
        }
      });
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
  } else if (isArray(node)) {
    return node.every(isValidJSXChild);
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
export const Fragment: FunctionComponent<{ children?: any; key?: string | number | null }> = (
  props
) => props.children as any;

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
  _isStatic: boolean,
  opts: JsxDevOpts,
  _ctx: any
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const children = untrack(() => {
    const c = props.children;
    if (typeof type === 'string') {
      delete props.children;
    }
    return c;
  });
  if (isString(type)) {
    if ('className' in (props as any)) {
      (props as any)['class'] = (props as any)['className'];
      delete (props as any)['className'];
      if (qDev) {
        logOnceWarn('jsx: `className` is deprecated. Use `class` instead.');
      }
    }
  }
  const node = new JSXNodeImpl<T>(type, props, null, children, 0, processed);
  node.dev = {
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

const filterStack = (stack: string, offset: number = 0) => {
  return stack
    .split('\n')
    .slice(offset)
    .filter((l) => !l.includes('/node_modules/@builder.io/qwik') && !l.includes('(node:'))
    .join('\n');
};

export { jsx as jsxs };
