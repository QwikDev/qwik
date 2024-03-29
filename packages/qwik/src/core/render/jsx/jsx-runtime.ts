import { isBrowser } from '@builder.io/qwik/build';
import type { JsxChild } from 'typescript';
import { isQwikComponent, type OnRenderFn } from '../../component/component.public';
import { _CONST_PROPS } from '../../internal';
import { isQrl, type QRLInternal } from '../../qrl/qrl-class';
import { verifySerializable } from '../../state/common';
import { _VAR_PROPS } from '../../state/constants';
import { isSignal, SignalDerived } from '../../state/signal';
import { invoke, untrack } from '../../use/use-core';
import { EMPTY_OBJ } from '../../util/flyweight';
import { logError, logOnceWarn, logWarn } from '../../util/log';
import { ELEMENT_ID, OnRenderProp, QScopedStyle, QSlot, QSlotS } from '../../util/markers';
import { isPromise } from '../../util/promises';
import { qDev, qRuntimeQrl, seal } from '../../util/qdev';
import { isArray, isFunction, isObject, isString } from '../../util/types';
import { static_subtree } from '../execute-component';
import type { DevJSX, FunctionComponent, JSXNode } from './types/jsx-node';
import type { QwikJSX } from './types/jsx-qwik';
import type { JSXChildren } from './types/jsx-qwik-attributes';
import { SkipRender } from './utils.public';

export type Props = Record<string, unknown>;

/**
 * Create a JSXNode with children already split
 *
 * @param type - The JSX type
 * @param varProps - The properties of the tag
 * @param constProps - The properties of the tag that are known to be constant references and don't
 *   need checking for changes on re-render
 * @param children - JSX children. Any `children` in the props objects are ignored.
 * @internal
 */
export const _jsxQ = <T>(
  type: T,
  varProps: Props | null,
  constProps: Props | null,
  children: JSXChildren | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const node = new JSXNodeImpl(
    type,
    (varProps as any) || {},
    constProps,
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
 * Create a JSXNode
 *
 * @param type - The tag type
 * @param varProps - The properties of the tag that could change, including children
 * @param constProps - The properties of the tag that are known to be static and don't need checking
 *   for changes on re-render
 * @internal
 */
export const _jsxC = <T extends string | FunctionComponent<any>>(
  type: T,
  varProps: Props | null,
  constProps: Props | null,
  flags: number,
  key: string | number | null,
  dev?: DevJSX
): JSXNode<T> => {
  let children;
  if (varProps) {
    children = varProps.children;
  } else {
    varProps = typeof type === 'string' ? EMPTY_OBJ : {};
  }
  return _jsxQ(type, varProps, constProps, children as JSXChildren, flags, key, dev);
};

/**
 * @public
 * Used by the JSX transpilers to create a JSXNode.
 * Note that the optimizer will not use this, instead using _jsxC and _jsxQ directly.
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Props,
  key?: string | number | null
): JSXNode<T> => {
  const processed = key == null ? null : String(key);
  const children = untrack(() => {
    const c = props.children;
    return c;
  });
  return _jsxQ(type, props, null, children, 0, processed);
};

export const SKIP_RENDER_TYPE = ':skipRender';

export const isPropsProxy = (
  obj: any
): obj is { [_VAR_PROPS]: Props; [_CONST_PROPS]: Props | null } => {
  return obj && obj[_VAR_PROPS] !== undefined;
};

export class JSXNodeImpl<T> implements JSXNode<T> {
  dev?: DevJSX;
  constructor(
    public type: T,
    public varProps: Props,
    public constProps: Props | null,
    public children: JSXChildren,
    public flags: number,
    public key: string | null = null
  ) {
    if (qDev) {
      if (typeof varProps !== 'object') {
        throw new Error(`JSXNodeImpl: varProps must be objects: ` + JSON.stringify(varProps));
      }
      if (typeof constProps !== 'object') {
        throw new Error(`JSXNodeImpl: constProps must be objects: ` + JSON.stringify(constProps));
      }
    }
  }

  private _proxy?: typeof this.varProps;
  get props(): T extends FunctionComponent<infer PROPS> ? PROPS : Props {
    // We use a proxy to merge the constProps if they exist and to evaluate derived signals
    if (!this._proxy) {
      this._proxy = createPropsProxy(this.varProps, this.constProps);
    }
    return this._proxy! as any;
  }
}

/** @private */
export const Virtual: FunctionComponent<{
  children?: JSXChildren;
  dangerouslySetInnerHTML?: string;
  [OnRenderProp]?: QRLInternal<OnRenderFn<any>>;
  [QSlot]?: string;
  [QSlotS]?: string;
  props?: Props;
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

const validateJSXNode = (node: JSXNode<any>) => {
  if (qDev) {
    const { type, varProps, constProps, children } = node;
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
          if (isFunction(type) || constProps) {
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
        ...(varProps ? Object.entries(varProps) : []),
        ...(constProps ? Object.entries(constProps) : []),
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
        // if (allProps.some((a) => a[0] === 'children')) {
        //   throw new Error(`The JSX element <${type}> can not have both 'children' as a property.`);
        // }
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

const printObjectLiteral = (obj: Props) => {
  return `{ ${Object.keys(obj)
    .map((key) => `"${key}"`)
    .join(', ')} }`;
};

/** @internal */
export const isJSXNode = <T>(n: unknown): n is JSXNode<T> => {
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
export const jsxDEV = <T extends string | FunctionComponent<Props>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Props,
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

export function createPropsProxy(varProps: Props, constProps: Props | null): Props {
  return new Proxy<any>({}, new PropsProxyHandler(varProps, constProps));
}

class PropsProxyHandler implements ProxyHandler<any> {
  constructor(
    private $varProps$: Props,
    private $constProps$: Props | null
  ) {}
  get(_: any, prop: string | symbol) {
    // escape hatch to get the separated props from a component
    if (prop === _CONST_PROPS) {
      return this.$constProps$;
    }
    if (prop === _VAR_PROPS) {
      return this.$varProps$;
    }
    const value =
      this.$constProps$ && prop in this.$constProps$
        ? this.$constProps$[prop as string]
        : this.$varProps$[prop as string];
    // a proxied value that the optimizer made
    return value instanceof SignalDerived ? value.value : value;
  }
  set(_: any, prop: string | symbol, value: any) {
    if (prop === _CONST_PROPS) {
      this.$constProps$ = value;
      return true;
    }
    if (prop === _VAR_PROPS) {
      this.$varProps$ = value;
      return true;
    }
    if (this.$constProps$ && prop in this.$constProps$) {
      this.$constProps$[prop as string] = value;
    } else {
      this.$varProps$[prop as string] = value;
    }
    return true;
  }
  deleteProperty(_: any, prop: string | symbol) {
    if (typeof prop !== 'string') {
      return false;
    }
    let didDelete = delete this.$varProps$[prop];
    if (this.$constProps$) {
      didDelete = delete this.$constProps$[prop as string] || didDelete;
    }
    return didDelete;
  }
  has(_: any, prop: string | symbol) {
    const hasProp =
      prop === _CONST_PROPS ||
      prop === _VAR_PROPS ||
      prop in this.$varProps$ ||
      (this.$constProps$ ? prop in this.$constProps$ : false);
    return hasProp;
  }
  getOwnPropertyDescriptor(target: any, p: string | symbol): PropertyDescriptor | undefined {
    return {
      configurable: true,
      enumerable: true,
      value: this.get(target, p),
    };
  }
  ownKeys() {
    const out = Object.keys(this.$varProps$);
    if (this.$constProps$) {
      for (const key in this.$constProps$) {
        if (out.indexOf(key) === -1) {
          out.push(key);
        }
      }
    }
    return out;
  }
}

export { jsx as jsxs };
