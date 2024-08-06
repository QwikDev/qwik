import { isQrl } from '../server/prefetch-strategy';
import { isJSXNode } from './render/jsx/jsx-runtime';
import { isTask } from './use/use-task';
import { vnode_isVNode, vnode_toString } from './v2/client/vnode';
import { isSignal2 } from './v2/signal/v2-signal';
import { isStore2 } from './v2/signal/v2-store';

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
          return vnode_toString.apply(value);
        } else {
          return value.map(qwikDebugToString);
        }
      } else if (isStore2(value) || isSignal2(value)) {
        return value.toString();
      } else if (isJSXNode(value)) {
        return jsxToString(value);
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
    let type = value.type;
    if (typeof type === 'function') {
      type = type.name || 'Component';
    }
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
