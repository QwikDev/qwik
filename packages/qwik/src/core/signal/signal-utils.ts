import { _CONST_PROPS, _IMMUTABLE } from '../shared/utils/constants';
import { assertEqual } from '../shared/error/assert';
import { isObject } from '../shared/utils/types';
import { WrappedSignal } from './v2-signal';
import { isSignal } from './v2-signal.public';
import { getStoreTarget } from './v2-store';

const getProp = (obj: any, prop: string) => obj[prop];

/** @internal */
export const _wrapProp = <T extends Record<any, any>, P extends keyof T>(
  obj: T,
  prop: P | undefined = 'value' as P
): any => {
  if (!isObject(obj)) {
    return obj[prop];
  }
  if (isSignal(obj)) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    if (obj instanceof WrappedSignal) {
      return obj;
    }
    return new WrappedSignal(null, getProp, [obj, prop as string], null);
  }
  if (_CONST_PROPS in obj) {
    const constProps = (obj as any)[_CONST_PROPS];
    if (constProps && prop in constProps) {
      // Const props don't need wrapping
      return constProps[prop];
    }
  } else {
    const target = getStoreTarget(obj);
    if (target) {
      const signal = target[prop];
      const wrappedValue = isSignal(signal)
        ? signal
        : new WrappedSignal(null, getProp, [obj, prop as string], null);
      return wrappedValue;
    }
  }
  // We need to forward the access to the original object
  return new WrappedSignal(null, getProp, [obj, prop as string], null);
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
