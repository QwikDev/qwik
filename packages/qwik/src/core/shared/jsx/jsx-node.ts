import type { QRL } from '../qrl/qrl.public';
import { EMPTY_OBJ } from '../utils/flyweight';
import { logWarn } from '../utils/log';
import { qDev, seal } from '../utils/qdev';
import { isObject } from '../utils/types';
import { _chk, _val } from './bind-handlers';
import { type Props } from './jsx-runtime';
import { createPropsProxy } from './props-proxy';
import type { DevJSX, FunctionComponent, JSXNodeInternal } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

const _hasOwnProperty = Object.prototype.hasOwnProperty;

// TODO store props as the arrays the vnodes also use?
export class JSXNodeImpl<T = unknown> implements JSXNodeInternal<T> {
  toSort: boolean;
  key: string | null;
  varProps: Props;
  constProps: Props | null;
  dev?: DevJSX & { stack: string | undefined };
  public _proxy: Props | null = null;

  constructor(
    public type: T,
    varProps: Props | null,
    constProps: Props | null,
    public children: JSXChildren,
    key: string | number | null | undefined,
    toSort?: boolean,
    dev?: DevJSX
  ) {
    this.toSort = !!toSort;
    this.key = key === null || key === undefined ? null : typeof key === 'string' ? key : '' + key;
    this.varProps = !varProps || isEmpty(varProps) ? EMPTY_OBJ : varProps;
    this.constProps = !constProps || isEmpty(constProps) ? null : constProps;
    if (qDev && dev) {
      this.dev = {
        ...dev,
        stack: new Error().stack?.split('\n').slice(2).join('\n'),
      };
    }

    seal(this);
  }

  get props(): T extends FunctionComponent<infer PROPS> ? PROPS : Props {
    // We use a proxy to merge the constProps if they exist and to evaluate derived signals
    return (this._proxy ||= createPropsProxy(this)) as any;
  }
}

/** @returns `true` if the event is new to the object */
export const mergeHandlers = (obj: Props, event: string, handler: QRL) => {
  let current = obj[event];
  if (current) {
    if (Array.isArray(current)) {
      current.push(handler);
    } else {
      current = obj[event] = [current, handler];
    }
  } else {
    obj[event] = handler;
    return true;
  }
};

/** @internal */
export const isJSXNode = <T>(n: unknown): n is JSXNodeInternal<T> => {
  if (qDev) {
    if (n instanceof JSXNodeImpl) {
      return true;
    }
    if (
      isObject(n) &&
      _hasOwnProperty.call(n, 'key') &&
      _hasOwnProperty.call(n, 'props') &&
      _hasOwnProperty.call(n, 'type')
    ) {
      logWarn(`Duplicate implementations of "JSXNode" found`);
      return true;
    }
    return false;
  } else {
    return n instanceof JSXNodeImpl;
  }
};

const isEmpty = (obj: Record<string, unknown>) => {
  return Object.keys(obj).length === 0;
};
