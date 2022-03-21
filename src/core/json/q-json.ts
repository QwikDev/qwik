// TODO(misko): need full object parsing /serializing
import { assertEqual } from '../assert/assert';
import type { QContext } from '../props/props';

export function qDeflate(obj: any, hostCtx: QContext): number {
  return hostCtx.refMap.add(obj);
}

export function qInflate(ref: number, hostCtx: QContext): any {
  const obj = hostCtx.refMap.get(ref);
  assertEqual(hostCtx.refMap.array.length > ref, true);
  return obj;
}
