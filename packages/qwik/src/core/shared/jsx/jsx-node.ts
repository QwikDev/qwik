import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { WrappedSignalFlags } from '../../reactive-primitives/types';
import { _CONST_PROPS, _VAR_PROPS, _OWNER } from '../utils/constants';
import { EMPTY_OBJ } from '../utils/flyweight';
import { logOnceWarn, logWarn } from '../utils/log';
import { qDev, seal } from '../utils/qdev';
import { isObject } from '../utils/types';
import { type Props } from './jsx-runtime';
import type { JSXNodeInternal, DevJSX, FunctionComponent } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

export class JSXNodeImpl<T = unknown> implements JSXNodeInternal<T> {
  type: T;
  toSort: boolean;
  key: string | null;
  varProps: Props;
  constProps: Props | null;
  children: JSXChildren;
  dev?: DevJSX & { stack: string | undefined };
  public _proxy: Props | null = null;

  constructor(
    type: T,
    varProps?: Props | null,
    constProps?: Props | null,
    children?: JSXChildren,
    key?: string | number | null,
    toSort?: boolean,
    dev?: DevJSX
  ) {
    this.type = type;
    this.toSort = !!toSort;
    this.key = key == null ? null : String(key);
    this.varProps = !varProps || isEmpty(varProps) ? EMPTY_OBJ : varProps;
    this.constProps = !constProps || isEmpty(constProps) ? null : constProps;
    this.children = children;
    if (qDev && dev) {
      this.dev = {
        ...dev,
        stack: new Error().stack?.split('\n').slice(2).join('\n'),
      };
    }

    if (typeof type === 'string') {
      if ('className' in this.varProps) {
        this.varProps.class = this.varProps.className;
        this.varProps.className = undefined;
        toSort = true;
        if (qDev) {
          logOnceWarn(
            `jsx${dev ? ` ${dev.fileName}${dev?.lineNumber ? `:${dev.lineNumber}` : ''}` : ''}: \`className\` is deprecated. Use \`class\` instead.`
          );
        }
      }
      if (this.constProps && 'className' in this.constProps) {
        this.constProps.class = this.constProps.className;
        this.constProps.className = undefined;
        if (qDev) {
          logOnceWarn(
            `jsx${dev ? ` ${dev.fileName}${dev?.lineNumber ? `:${dev.lineNumber}` : ''}` : ''}: \`className\` is deprecated. Use \`class\` instead.`
          );
        }
      }
    }
    seal(this);
  }

  get props(): T extends FunctionComponent<infer PROPS> ? PROPS : Props {
    // We use a proxy to merge the constProps if they exist and to evaluate derived signals
    return (this._proxy ||= createPropsProxy(this)) as any;
  }
}
/** @internal */

export const isJSXNode = <T>(n: unknown): n is JSXNodeInternal<T> => {
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
// TODO store props as the arrays the vnodes also use

export function createPropsProxy(owner: JSXNodeImpl): Props {
  // TODO don't make a proxy but populate getters?
  return new Proxy<any>({}, new PropsProxyHandler(owner));
}
class PropsProxyHandler implements ProxyHandler<any> {
  constructor(public owner: JSXNodeImpl) {}
  get(_: any, prop: string | symbol) {
    // escape hatch to get the separated props from a component
    if (prop === _CONST_PROPS) {
      return this.owner.constProps;
    }
    if (prop === _VAR_PROPS) {
      return this.owner.varProps;
    }
    if (prop === _OWNER) {
      return this.owner;
    }
    const value =
      prop === 'children'
        ? this.owner.children
        : this.owner.constProps && prop in this.owner.constProps
          ? this.owner.constProps[prop as string]
          : this.owner.varProps[prop as string];
    // a proxied value that the optimizer made
    return value instanceof WrappedSignalImpl && value.$flags$ & WrappedSignalFlags.UNWRAP
      ? value.value
      : value;
  }
  set(_: any, prop: string | symbol, value: any) {
    if (prop === _OWNER) {
      // used for deserialization
      this.owner = value;
    } else if (prop === 'children') {
      this.owner.children = value;
    } else if (this.owner.constProps && prop in this.owner.constProps) {
      this.owner.constProps[prop as string] = value;
    } else {
      if (this.owner.varProps === EMPTY_OBJ) {
        this.owner.varProps = {};
      } else {
        if (!(prop in this.owner.varProps)) {
          this.owner.toSort = true;
        }
      }
      this.owner.varProps[prop as string] = value;
    }
    return true;
  }
  deleteProperty(_: any, prop: string | symbol) {
    let didDelete = delete this.owner.varProps[prop as string];
    if (this.owner.constProps) {
      didDelete = delete this.owner.constProps[prop as string] || didDelete;
    }
    if (this.owner.children != null && prop === 'children') {
      this.owner.children = null;
      didDelete = true;
    }
    return didDelete;
  }
  has(_: any, prop: string | symbol) {
    const hasProp =
      prop === 'children'
        ? this.owner.children != null
        : prop === _CONST_PROPS ||
          prop === _VAR_PROPS ||
          prop in this.owner.varProps ||
          (this.owner.constProps ? prop in this.owner.constProps : false);
    return hasProp;
  }
  getOwnPropertyDescriptor(_: any, p: string | symbol): PropertyDescriptor | undefined {
    const value =
      p === 'children'
        ? this.owner.children
        : this.owner.constProps && p in this.owner.constProps
          ? this.owner.constProps[p as string]
          : this.owner.varProps[p as string];
    return {
      configurable: true,
      enumerable: true,
      value: value,
    };
  }
  ownKeys() {
    const out = Object.keys(this.owner.varProps);
    if (this.owner.children != null) {
      out.push('children');
    }
    if (this.owner.constProps) {
      for (const key in this.owner.constProps) {
        if (out.indexOf(key) === -1) {
          out.push(key);
        }
      }
    }
    return out;
  }
}
/**
 * Instead of using PropsProxyHandler getter (which could create a component-level subscription).
 * Use this function to get the props directly from a const or var props.
 */

export const directGetPropsProxyProp = <T, JSX>(jsx: JSXNodeInternal<JSX>, prop: string): T => {
  return (
    jsx.constProps && prop in jsx.constProps ? jsx.constProps[prop] : jsx.varProps[prop]
  ) as T;
};
/** @internal */
// TODO Needed?

export const _getVarProps = <T, JSX>(
  props: PropsProxy | Record<string, unknown> | null | undefined
): Props | null => {
  if (!props) {
    return null;
  }
  return _VAR_PROPS in props
    ? 'children' in props
      ? { ...props[_VAR_PROPS], children: props.children }
      : props[_VAR_PROPS]
    : props;
};
/** @internal */

export const _getConstProps = <T, JSX>(
  props: PropsProxy | Record<string, unknown> | null | undefined
): Props | null => {
  if (!props) {
    return null;
  }
  return _CONST_PROPS in props ? props[_CONST_PROPS] : null;
};
export type PropsProxy = {
  [_VAR_PROPS]: Props;
  [_CONST_PROPS]: Props | null;
  [_OWNER]: JSXNodeInternal;
};
export const isPropsProxy = (obj: any): obj is PropsProxy => {
  return obj && obj[_VAR_PROPS] !== undefined;
};
export function isEmpty(obj: Record<string, unknown>) {
  for (const prop in obj) {
    if (obj[prop] !== undefined) {
      return false;
    }
  }
  return true;
}
