import type { DevJSX, FunctionComponent, JSXNode, JSXNodeInternal } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { logError, logOnceWarn, logWarn } from '../../util/log';
import { isArray, isFunction, isObject, isString } from '../../util/types';
import { isQrl, type QRLInternal } from '../../qrl/qrl-class';
import { invoke, untrack } from '../../use/use-core';
import { verifySerializable } from '../../state/common';
import { isQwikComponent, type OnRenderFn } from '../../component/component.public';
import { isSignal } from '../../state/signal';
import { isPromise } from '../../util/promises';
import { SkipRender } from './utils.public';
import { EMPTY_OBJ } from '../../util/flyweight';
import { _IMMUTABLE } from '../../internal';
// keep this import from qwik/build so the cjs build works
import { isBrowser } from '@builder.io/qwik/build';
import { assertString } from '../../error/assert';
import { static_subtree } from '../execute-component';
import type { JsxChild } from 'typescript';
import { ELEMENT_ID, OnRenderProp, QScopedStyle, QSlot, QSlotS } from '../../util/markers';
import type { JSXChildren } from './types/jsx-qwik-attributes';
import { _IMMUTABLE_PREFIX } from '../../state/constants';

/**
 * @internal
 *
 * Create a JSXNode for a string tag
 */
export const _jsxQ = <T extends string>(
  type: T,
  mutableProps: Record<any, unknown> | null,
  immutableProps: Record<any, unknown> | null,
  children: JSXChildren | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
): JSXNodeInternal<T> => {
  assertString(type, 'jsx type must be a string');
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl<T>(
    type,
    mutableProps || (EMPTY_OBJ as any),
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
  validateJSXNode(node);
  seal(node);
  return node;
};

/**
 * @internal
 *
 * A string tag with dynamic props, possibly containing children
 */
export const _jsxS = <T extends string>(
  type: T,
  mutableProps: Record<any, unknown> | null,
  immutableProps: Record<any, unknown> | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
): JSXNodeInternal<T> => {
  let children: JSXChildren = null;
  if (mutableProps && 'children' in mutableProps) {
    children = mutableProps.children as JSXChildren;
    delete mutableProps.children;
  }
  return _jsxQ(type, mutableProps, immutableProps, children, flags, key, dev);
};

/**
 * @internal
 *
 * Create a JSXNode for any tag, with possibly immutable props embedded in props
 */
export const _jsxC = <T extends string | FunctionComponent<Record<any, unknown>>>(
  type: T,
  mutableProps: (T extends FunctionComponent<infer PROPS> ? PROPS : Record<any, unknown>) | null,
  flags: number,
  key: string | number | null,
  dev?: JsxDevOpts
): JSXNodeInternal<T> => {
  const processed = key == null ? null : String(key);
  const props = mutableProps ?? ({} as NonNullable<typeof mutableProps>);
  // In dynamic components, type could be a string
  if (typeof type === 'string' && _IMMUTABLE in props) {
    const immutableProps = props[_IMMUTABLE] as Record<any, unknown>;
    delete props[_IMMUTABLE];
    const children = props.children as JSXChildren;
    delete props.children;
    // Immutable handling for string tags is a bit different, merge all and consider immutable
    for (const [k, v] of Object.entries(immutableProps)) {
      if (v !== _IMMUTABLE) {
        delete props[k];
        (props as any)[k] = v;
      }
    }
    return _jsxQ(type, null, props, children, flags, key, dev);
  }
  const node = new JSXNodeImpl<T>(
    type,
    props,
    null,
    props.children as JSXChildren,
    flags,
    processed
  );
  if (typeof type === 'string' && mutableProps) {
    delete mutableProps.children;
  }
  if (qDev && dev) {
    node.dev = {
      stack: new Error().stack,
      ...dev,
    };
  }
  validateJSXNode(node);
  seal(node);
  return node;
};

/**
 * @public
 * Used by the JSX transpilers to create a JSXNode.
 * Note that the optimizer will not use this, instead using _jsxQ, _jsxS, and _jsxC directly.
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<any, unknown>,
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
    if ('className' in props) {
      (props as any).class = props.className;
      delete props.className;
      if (qDev) {
        logOnceWarn('jsx: `className` is deprecated. Use `class` instead.');
      }
    }
  }
  const node = new JSXNodeImpl<T>(type, props, null, children, 0, processed);
  validateJSXNode(node);
  seal(node);
  return node;
};

export const SKIP_RENDER_TYPE = ':skipRender';

export class JSXNodeImpl<T> implements JSXNode<T> {
  dev?: DevJSX;
  constructor(
    public type: T,
    public props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<any, unknown>,
    public immutableProps: Record<any, unknown> | null,
    public children: JSXChildren,
    public flags: number,
    public key: string | null = null
  ) {}
}

/** @public */
export const Virtual: FunctionComponent<{
  children?: JSXChildren;
  dangerouslySetInnerHTML?: string;
  [OnRenderProp]?: QRLInternal<OnRenderFn<any>>;
  [QSlot]?: string;
  [QSlotS]?: string;
  [_IMMUTABLE]?: Record<any, unknown>;
  props?: Record<any, unknown>;
  [QScopedStyle]?: string;
  [ELEMENT_ID]?: string;
}> = (props: any) => props.children;

/** @public */
export const RenderOnce: FunctionComponent<{
  children?: unknown;
  key?: string | number | null | undefined;
}> = (props: any, key) => {
  return new JSXNodeImpl(Virtual, EMPTY_OBJ, null, props.children, static_subtree, key);
};

const validateJSXNode = (node: JSXNodeInternal) => {
  if (qDev) {
    const { type, props, immutableProps, children } = node;
    invoke(undefined, () => {
      const isQwikC = isQwikComponent(type);
      if (!isString(type) && !isFunction(type)) {
        throw new Error(
          `The <Type> of the JSX element must be either a string or a function. Instead, it's a "${typeof type}": ${String(
            type
          )}.`
        );
      }
      if (children) {
        const flatChildren = isArray(children) ? children.flat() : [children];
        if (isString(type) || isQwikC) {
          flatChildren.forEach((child: unknown) => {
            if (!isValidJSXChild(child)) {
              const typeObj = typeof child;
              let explanation = '';
              if (typeObj === 'object') {
                if (child?.constructor) {
                  explanation = `it's an instance of "${child?.constructor.name}".`;
                } else {
                  explanation = `it's a object literal: ${printObjectLiteral(child as {})} `;
                }
              } else if (typeObj === 'function') {
                explanation += `it's a function named "${(child as Function).name}".`;
              } else {
                explanation = `it's a "${typeObj}": ${String(child)}.`;
              }

              throw new Error(
                `One of the children of <${type}> is not an accepted value. JSX children must be either: string, boolean, number, <element>, Array, undefined/null, or a Promise/Signal. Instead, ${explanation}\n`
              );
            }
          });
        }
        if (isBrowser) {
          if (isFunction(type) || immutableProps) {
            const keys: Record<string, boolean> = {};
            flatChildren.forEach((child: unknown) => {
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

      const allProps = [
        ...Object.entries(props),
        ...(immutableProps ? Object.entries(immutableProps) : []),
      ];
      if (!qRuntimeQrl) {
        for (const [prop, value] of allProps) {
          if (prop.endsWith('$') && value) {
            if (!isQrl(value) && !Array.isArray(value)) {
              throw new Error(
                `The value passed in ${prop}={...}> must be a QRL, instead you passed a "${typeof value}". Make sure your ${typeof value} is wrapped with $(...), so it can be serialized. Like this:\n$(${String(
                  value
                )})`
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
        const hasSetInnerHTML = allProps.some((a) => a[0] === 'dangerouslySetInnerHTML');
        if (hasSetInnerHTML && children) {
          const err = createJSXError(
            `The JSX element <${type}> can not have both 'dangerouslySetInnerHTML' and children.`,
            node
          );
          logError(err);
        }
        if (allProps.some((a) => a[0] === 'children')) {
          throw new Error(`The JSX element <${type}> can not have both 'children' as a property.`);
        }
        if (type === 'style') {
          if (children) {
            logOnceWarn(`jsx: Using <style>{content}</style> will escape the content, effectively breaking the CSS.
In order to disable content escaping use '<style dangerouslySetInnerHTML={content}/>'

However, if the use case is to inject component styleContent, use 'useStyles$()' instead, it will be a lot more efficient.
See https://qwik.dev/docs/components/styles/#usestyles for more information.`);
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
};

const printObjectLiteral = (obj: Record<string, unknown>) => {
  return `{ ${Object.keys(obj)
    .map((key) => `"${key}"`)
    .join(', ')} }`;
};

export const isJSXNode = (n: unknown): n is JSXNodeInternal => {
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

export const isValidJSXChild = (node: unknown): node is JsxChild => {
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

/** @public */
export const Fragment: FunctionComponent<{ children?: any; key?: string | number | null }> = (
  props
) => props.children;

interface JsxDevOpts {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

/** @public */
export const HTMLFragment: FunctionComponent<{ dangerouslySetInnerHTML: string }> = (props) =>
  jsx(Virtual, props);

/** @public */
export const jsxDEV = <T extends string | FunctionComponent<Record<any, unknown>>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Record<any, unknown>,
  key: string | number | null | undefined,
  _isStatic: boolean,
  opts: JsxDevOpts,
  _ctx: unknown
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const children = untrack(() => {
    const c = props.children;
    if (typeof type === 'string') {
      delete props.children;
    }
    return c;
  }) as JSXChildren;
  if (isString(type)) {
    if ('className' in props) {
      (props as any).class = props.className;
      delete props.className;
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
  validateJSXNode(node);
  seal(node);
  return node;
};

export type { QwikJSX as JSX };

export const createJSXError = (message: string, node: JSXNode) => {
  const error = new Error(message);
  if (!node.dev) {
    return error;
  }
  error.stack = `JSXError: ${message}\n${filterStack(node.dev.stack!, 1)}`;
  return error;
};

const filterStack = (stack: string, offset: number = 0) => {
  return stack.split('\n').slice(offset).join('\n');
};

export { jsx as jsxs };
