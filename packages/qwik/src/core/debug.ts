import { isQrl } from "../server/prefetch-strategy";
import { isTask } from "./use/use-task";
import { isSignal2 } from "./v2/signal/v2-signal";

export function qwikDebugToString(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(qwikDebugToString);
  } else if (isTask(obj)) {
    return `Task(${qwikDebugToString(obj.$qrl$)})`
  } else if (isQrl(obj)) {
    return `Qrl(${obj.$symbol$})`
  } else if (isSignal2(obj)) {
    return String(obj)
  }
  return obj;
}