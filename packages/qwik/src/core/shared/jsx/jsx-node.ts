import { createQRL } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import { jsxEventToHtmlAttribute } from '../utils/event-names';
import { EMPTY_OBJ } from '../utils/flyweight';
import { logOnceWarn, logWarn } from '../utils/log';
import { qDev, seal } from '../utils/qdev';
import { isObject } from '../utils/types';
import { _chk, _val } from './bind-handlers';
import { type Props } from './jsx-runtime';
import { createPropsProxy } from './props-proxy';
import type { DevJSX, FunctionComponent, JSXNodeInternal } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

const BIND_VALUE = 'bind:value';
const BIND_CHECKED = 'bind:checked';

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
      // convert onEvent$ to on:event
      for (const k in this.constProps) {
        const attr = jsxEventToHtmlAttribute(k);
        if (attr) {
          mergeHandlers(this.constProps, attr, this.constProps[k] as QRL);
          this.constProps[k] = undefined;
        }
      }
      for (const k in this.varProps) {
        const attr = jsxEventToHtmlAttribute(k);
        if (attr) {
          // constProps always wins
          if (!constProps || !(k in constProps)) {
            toSort = mergeHandlers(this.varProps, attr, this.varProps[k] as QRL) || toSort;
          }
          this.varProps[k] = undefined;
        }
      }

      // bind:*
      if (BIND_CHECKED in this.varProps) {
        toSort = handleBindProp(this.varProps, BIND_CHECKED)! || toSort;
      } else if (BIND_VALUE in this.varProps) {
        toSort = handleBindProp(this.varProps, BIND_VALUE)! || toSort;
      } else if (this.constProps) {
        if (BIND_CHECKED in this.constProps) {
          handleBindProp(this.constProps, BIND_CHECKED);
        } else {
          if (BIND_VALUE in this.constProps) {
            handleBindProp(this.constProps, BIND_VALUE);
          }
        }
      }

      // TODO let the optimizer do this instead
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

const handleBindProp = (props: Props, prop: string) => {
  const value = props[prop];
  props[prop] = undefined;
  if (value) {
    if (prop === BIND_CHECKED) {
      props.checked = value;
      props['on:input'] = createQRL(null, '_chk', _chk, null, null, [value]);
    } else {
      props.value = value;
      props['on:input'] = createQRL(null, '_val', _val, null, null, [value]);
    }
    return true;
  }
};
