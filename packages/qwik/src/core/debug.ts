import { isQrl } from "../server/prefetch-strategy";
import { isTask } from "./use/use-task";
import { vnode_isVNode, vnode_toString } from "./v2/client/vnode";

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
  } else if (typeof value === 'object' || typeof value === 'function') {
    if (stringifyPath.includes(value)) {
      return '*';
    }
    if (stringifyPath.length > 10) {
      debugger;
    }
    try {
      stringifyPath.push(value);
      if (Array.isArray(value)) {
        if (vnode_isVNode(value)) {
          return vnode_toString.apply(value);
        } else {
          return value.map(qwikDebugToString);
        }
      } else if (isTask(value)) {
        return `Task(${qwikDebugToString(value.$qrl$)})`
      } else if (isQrl(value)) {
        return `Qrl(${value.$symbol$})`
      }
    } finally {
      stringifyPath.pop();
    }
  }
  return value;
}



export const pad = (text: string, prefix: string) => {
  return String(text).split('\n').map((line, idx) => (idx ? prefix : '') + line).join('\n');
}