import { assertDefined } from '../error/assert';
import { SignalDerived } from '../state/signal';
import { qSerialize } from '../util/qdev';

/** @internal */
export const _fnSignal = <T extends (...args: any) => any>(
  fn: T,
  args: Parameters<T>,
  fnStr?: string
) => {
  return new SignalDerived<ReturnType<T>, Parameters<T>>(fn, args, fnStr);
};

export const serializeDerivedSignalFunc = (signal: SignalDerived) => {
  const fnBody = qSerialize ? signal.$funcStr$ : 'null';
  assertDefined(fnBody, 'If qSerialize is true then fnStr must be provided.');
  let args = '';
  for (let i = 0; i < signal.$args$.length; i++) {
    args += `p${i},`;
  }
  return `(${args})=>(${fnBody})`;
};
