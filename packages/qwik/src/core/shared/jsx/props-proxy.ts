import { addStoreEffect } from '../../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { WrappedSignalFlags, type EffectSubscription } from '../../reactive-primitives/types';
import { tryGetInvokeContext } from '../../use/use-core';
import { _CONST_PROPS, _VAR_PROPS, _OWNER, _PROPS_HANDLER } from '../utils/constants';
import { jsxEventToHtmlAttribute } from '../utils/event-names';
import { EMPTY_OBJ } from '../utils/flyweight';
import type { JSXNodeImpl } from './jsx-node';
import type { Props } from './jsx-runtime';
import type { JSXNodeInternal } from './types/jsx-node';
import type { Container } from '../types';
import { assertTrue } from '../error/assert';
import { scheduleEffects } from '../../reactive-primitives/utils';
import { isDev } from '@qwik.dev/core/build';

export function createPropsProxy(owner: JSXNodeImpl): Props {
  // TODO don't make a proxy but populate getters? benchmark
  return new Proxy<any>({}, new PropsProxyHandler(owner));
}
export class PropsProxyHandler implements ProxyHandler<any> {
  $effects$: undefined | Map<string | symbol, Set<EffectSubscription>> = undefined;
  $container$: Container | null = null;

  constructor(public owner: JSXNodeImpl) {}
  get(_: any, prop: string | symbol) {
    // escape hatch to get the separated props from a component
    if (prop === _CONST_PROPS) {
      return this.owner.constProps;
    } else if (prop === _VAR_PROPS) {
      return this.owner.varProps;
    } else if (prop === _OWNER) {
      return this.owner;
    } else if (prop === _PROPS_HANDLER) {
      return this;
    }
    let value: unknown;
    if (prop === 'children') {
      value = this.owner.children;
    } else {
      if (typeof prop === 'string' && typeof this.owner.type === 'string') {
        const attr = jsxEventToHtmlAttribute(prop as string);
        if (attr) {
          prop = attr;
        }
      }
      value = directGetPropsProxyProp(this.owner, prop as string);
      if (prop in this.owner.varProps) {
        addPropsProxyEffect(this, prop);
      }
    }
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
    } else if (prop === _CONST_PROPS) {
      this.owner.constProps = value;
    } else if (prop === _VAR_PROPS) {
      this.owner.varProps = value;
    } else {
      if (typeof prop === 'string' && typeof this.owner.type === 'string') {
        const attr = jsxEventToHtmlAttribute(prop as string);
        if (attr) {
          prop = attr;
        }
      }

      if (this.owner.constProps && prop in this.owner.constProps) {
        // delete the prop from the const props first
        delete this.owner.constProps[prop as string];
      }
      if (this.owner.varProps === EMPTY_OBJ) {
        this.owner.varProps = {};
      } else if (!(prop in this.owner.varProps)) {
        this.owner.toSort = true;
      }
      if (this.owner.varProps[prop as string] !== value) {
        this.owner.varProps[prop as string] = value;
        triggerPropsProxyEffect(this, prop);
      }
    }
    return true;
  }
  deleteProperty(_: any, prop: string | symbol) {
    let didDelete = delete this.owner.varProps[prop as string];
    if (didDelete) {
      triggerPropsProxyEffect(this, prop);
    }
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
    if (prop === 'children') {
      return this.owner.children != null;
    } else if (prop === _CONST_PROPS || prop === _VAR_PROPS) {
      return true;
    }
    const inVarProps = prop in this.owner.varProps;
    if (typeof prop === 'string') {
      if (inVarProps) {
        addPropsProxyEffect(this, prop);
      }
      if (typeof this.owner.type === 'string') {
        const attr = jsxEventToHtmlAttribute(prop as string);
        if (attr) {
          prop = attr;
        }
      }
    }

    return inVarProps || (this.owner.constProps ? prop in this.owner.constProps : false);
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

const addPropsProxyEffect = (propsProxy: PropsProxyHandler, prop: string | symbol) => {
  // Lazily grab the container from the invoke context
  const ctx = tryGetInvokeContext();
  if (ctx) {
    if (propsProxy.$container$ === null) {
      if (ctx.$container$) {
        propsProxy.$container$ = ctx.$container$;
      }
    } else {
      isDev &&
        assertTrue(
          !ctx.$container$ || ctx.$container$ === propsProxy.$container$,
          'Do not use props across containers'
        );
    }
  }
  const effectSubscriber = ctx?.$effectSubscriber$;
  if (effectSubscriber) {
    addStoreEffect(propsProxy.owner._proxy!, prop, propsProxy, effectSubscriber);
  }
};

export const triggerPropsProxyEffect = (propsProxy: PropsProxyHandler, prop: string | symbol) => {
  const effects = getEffects(propsProxy.$effects$, prop);
  if (effects) {
    scheduleEffects(propsProxy.$container$, propsProxy, effects);
  }
};

function getEffects(
  effects: Map<string | symbol, Set<EffectSubscription>> | undefined,
  prop: string | symbol
) {
  // TODO: Handle STORE_ALL_PROPS
  return effects?.get(prop);
}

/**
 * Instead of using PropsProxyHandler getter (which could create a component-level subscription).
 * Use this function to get the props directly from a const or var props.
 *
 * This does not convert jsx event names.
 */
export const directGetPropsProxyProp = <T, JSX>(jsx: JSXNodeInternal<JSX>, prop: string): T => {
  return (
    jsx.constProps && prop in jsx.constProps ? jsx.constProps[prop] : jsx.varProps[prop]
  ) as T;
};

/** Used by the optimizer for spread props operations @internal */
export const _getVarProps = (
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
/** Used by the optimizer for spread props operations @internal */
export const _getConstProps = (
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
  [_PROPS_HANDLER]: PropsProxyHandler;
} & Record<string | symbol, unknown>;

export const isPropsProxy = (obj: any): obj is PropsProxy => {
  return obj && _VAR_PROPS in obj;
};
