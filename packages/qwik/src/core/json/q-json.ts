// TODO(misko): need full object parsing /serializing
import { assertEqual } from '../assert/assert';
import type { QContext } from '../props/props';

export function qDeflate(obj: any, hostCtx: QContext): string {
  return String(hostCtx.refMap.add(obj));
}

export function qInflate(ref: string, hostCtx: QContext): any {
  const int = parseInt(ref, 10);
  const obj = hostCtx.refMap.get(int);
  assertEqual(hostCtx.refMap.array.length > int, true);
  return obj;
}
