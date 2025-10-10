import { EMPTY_OBJ } from '../utils/flyweight';
import { logOnceWarn, logWarn } from '../utils/log';
import { qDev, seal } from '../utils/qdev';
import { isObject } from '../utils/types';
import { type Props } from './jsx-runtime';
import { createPropsProxy } from './props-proxy';
import type { DevJSX, FunctionComponent, JSXNodeInternal } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

// TODO store props as the arrays the vnodes also use?
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

const isEmpty = (obj: Record<string, unknown>) => {
  for (const prop in obj) {
    if (obj[prop] !== undefined) {
      return false;
    }
  }
  return true;
};
