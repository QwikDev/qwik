import { isSignal } from './reactive-primitives/utils';
// ^ keep this first to avoid circular dependency breaking class extend
import { vnode_isVNode } from './client/vnode';
import { ComputedSignalImpl } from './reactive-primitives/impl/computed-signal-impl';
import { isStore } from './reactive-primitives/impl/store';
import { WrappedSignalImpl } from './reactive-primitives/impl/wrapped-signal-impl';
import { isJSXNode } from './shared/jsx/jsx-node';
import { isQrl } from './shared/qrl/qrl-utils';
import { DEBUG_TYPE } from './shared/types';
import { isTask } from './use/use-task';

const stringifyPath: any[] = [];
export function qwikDebugToString(value: any): any {
  if (value === null) {
    return 'null';
  } else if (value === undefined) {
    return 'undefined';
  } else if (typeof value === 'string') {
    return '"' + value + '"';
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  } else if (isTask(value)) {
    return `Task(${qwikDebugToString(value.$qrl$)})`;
  } else if (isQrl(value)) {
    return `Qrl(${value.$symbol$})`;
  } else if (typeof value === 'object' || typeof value === 'function') {
    if (stringifyPath.includes(value)) {
      return '*';
    }
    if (stringifyPath.length > 10) {
      // debugger;
    }
    try {
      stringifyPath.push(value);
      if (Array.isArray(value)) {
        if (vnode_isVNode(value)) {
          return '(' + value.getProp(DEBUG_TYPE, null) + ')';
        } else {
          return value.map(qwikDebugToString);
        }
      } else if (isSignal(value)) {
        if (value instanceof WrappedSignalImpl) {
          return 'WrappedSignal';
        } else if (value instanceof ComputedSignalImpl) {
          return 'ComputedSignal';
        } else {
          return 'Signal';
        }
      } else if (isStore(value)) {
        return 'Store';
      } else if (isJSXNode(value)) {
        return jsxToString(value);
      } else if (vnode_isVNode(value)) {
        return '(' + value.getProp(DEBUG_TYPE, null) + ')';
      }
    } finally {
      stringifyPath.pop();
    }
  }
  return value;
}

export const pad = (text: string, prefix: string) => {
  return String(text)
    .split('\n')
    .map((line, idx) => (idx ? prefix : '') + line)
    .join('\n');
};

export const jsxToString = (value: any): string => {
  if (isJSXNode(value)) {
    let str = '<' + value.type;
    if (value.props) {
      for (const [key, val] of Object.entries(value.props)) {
        str += ' ' + key + '=' + qwikDebugToString(val);
      }
      const children = value.children;
      if (children != null) {
        str += '>';
        if (Array.isArray(children)) {
          children.forEach((child) => {
            str += jsxToString(child);
          });
        } else {
          str += jsxToString(children);
        }
        str += '</' + value.type + '>';
      } else {
        str += '/>';
      }
    }
    return str;
  } else {
    return String(value);
  }
};
