import { assertEqual } from '../shared/error/assert';
import { isPropsProxy } from '../shared/jsx/props-proxy';
import { _CONST_PROPS, _IMMUTABLE } from '../shared/utils/constants';
import { isObject } from '../shared/utils/types';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';
import type { SignalImpl } from './impl/signal-impl';
import { getStoreTarget, isStore } from './impl/store';
import { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import { isSignal, type Signal } from './signal.public';
import { WrappedSignalFlags } from './types';

// Keep these properties named like this so they're the same as from wrapSignal
export const getValueProp = <T>(p0: { value: T }) => p0.value;
const getProp = <T extends object, P extends keyof T>(p0: T, p1: P) => p0[p1];

const getWrapped = <T extends object>(args: [T, (keyof T | undefined)?]) => {
  if (args.length === 1) {
    if (isSignal(args[0])) {
      return ((args[0] as unknown as SignalImpl).$wrappedSignal$ ||= new WrappedSignalImpl(
        null,
        getValueProp,
        args,
        null
      ));
    } else if (isStore(args[0])) {
      return new WrappedSignalImpl(null, getValueProp, args, null);
    }
    return (args[0] as { value: T }).value;
  } else {
    return new WrappedSignalImpl(null, getProp, args, null);
  }
};

type PropType<T extends object, P extends keyof T> = P extends keyof T
  ? T[P]
  : 'value' extends keyof T
    ? T['value']
    : never;
type WrappedProp<T extends object, P extends keyof T> = T extends Signal
  ? WrappedSignalImpl<PropType<T, P>>
  : PropType<T, P>;

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
export const _wrapProp = <T extends object, P extends keyof T>(
  ...args: [T, P?]
): WrappedProp<T, P> => {
  const obj = args[0];
  const prop = args.length < 2 ? 'value' : args[1]!;

  if (!isObject(obj)) {
    return obj[prop];
  }
  if (isSignal(obj)) {
    if (!(obj instanceof AsyncComputedSignalImpl)) {
      assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    }
    if (obj instanceof WrappedSignalImpl && obj.$flags$ & WrappedSignalFlags.UNWRAP) {
      return obj as WrappedProp<T, P>;
    }
    return getWrapped(args) as WrappedProp<T, P>;
  }
  if (isPropsProxy(obj)) {
    const constProps = obj[_CONST_PROPS];
    if (constProps && prop in constProps) {
      // Const props don't need wrapping
      return constProps[prop as keyof typeof constProps] as WrappedProp<T, P>;
    }
  } else {
    const target = getStoreTarget(obj);
    if (target) {
      const value = target[prop as P];
      const wrappedValue = isSignal(value)
        ? // If the value is already a signal, we don't need to wrap it again
          value
        : getWrapped(args);
      return wrappedValue as WrappedProp<T, P>;
    }
  }
  // the object is not reactive, so we can just return the value
  return obj[prop as P] as WrappedProp<T, P>;
};

/** @internal @deprecated v1 compat */
export const _wrapSignal = <T extends object, P extends keyof T>(obj: T, prop: P) => {
  const r = _wrapProp(obj, prop);
  if (r === _IMMUTABLE) {
    return obj[prop];
  }
  return r;
};
