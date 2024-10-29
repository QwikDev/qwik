import { _CONST_PROPS, _IMMUTABLE } from '../shared/utils/constants';
import { assertEqual } from '../shared/error/assert';
import { isObject } from '../shared/utils/types';
import { WrappedSignal } from './signal';
import { isSignal } from './signal.public';
import { getStoreTarget } from './store';
import { isPropsProxy } from '../shared/jsx/jsx-runtime';

// Keep these properties named like this so they're the same as from wrapSignal
const getValueProp = (p0: any) => p0.value;
const getProp = (p0: any, p1: string) => p0[p1];

const getWrapped = (args: any[]) =>
  new WrappedSignal(null, args.length === 1 ? getValueProp : getProp, args, null);

/**
 * This wraps a property access of a possible Signal/Store into a WrappedSignal. The optimizer does
 * this automatically when a prop is only used as a prop on JSX.
 *
 * When a WrappedSignal is read via the PropsProxy, it will be unwrapped. This allows forwarding the
 * reactivity of a prop to the point of actual use.
 *
 * For efficiency, if you pass only one argument, the property is 'value'.
 *
 * @internal
 */
export const _wrapProp = <T extends Record<any, any>, P extends keyof T>(...args: [T, P?]): any => {
  const obj = args[0];
  const prop = args.length < 2 ? 'value' : args[1]!;

  if (!isObject(obj)) {
    return obj[prop];
  }
  if (isSignal(obj)) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    if (obj instanceof WrappedSignal) {
      return obj;
    }
    return getWrapped(args);
  }
  if (isPropsProxy(obj)) {
    const constProps = obj[_CONST_PROPS] as any;
    if (constProps && prop in constProps) {
      // Const props don't need wrapping
      return constProps[prop];
    }
  } else {
    const target = getStoreTarget(obj);
    if (target) {
      const value = target[prop];
      const wrappedValue = isSignal(value)
        ? // If the value is already a signal, we don't need to wrap it again
          value
        : getWrapped(args);
      return wrappedValue;
    }
  }
  // We need to forward the access to the original object
  return getWrapped(args);
};

/** @internal @deprecated v1 compat */
export const _wrapSignal = <T extends Record<any, any>, P extends keyof T>(
  obj: T,
  prop: P
): any => {
  const r = _wrapProp(obj, prop);
  if (r === _IMMUTABLE) {
    return obj[prop];
  }
  return r;
};
