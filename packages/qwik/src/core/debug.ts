import { isQrl } from "../server/prefetch-strategy";
import { isTask } from "./use/use-task";
import { vnode_isVNode, vnode_toString } from "./v2/client/vnode";

export function qwikDebugToString(obj: any): any {
  if (Array.isArray(obj)) {
    if (vnode_isVNode(obj)) {
      return vnode_toString.apply(obj);
    } else {
      return obj.map(qwikDebugToString);
    }
  } else if (isTask(obj)) {
    return `Task(${qwikDebugToString(obj.$qrl$)})`
  } else if (isQrl(obj)) {
    return `Qrl(${obj.$symbol$})`
  }
  return obj;
}

export const pad = (text: string, prefix: string) => {
  return String(text).split('\n').map((line, idx) => (idx ? prefix : '') + line).join('\n');
}