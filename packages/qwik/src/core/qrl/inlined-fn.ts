import { assertDefined } from '../error/assert';
import { SignalDerived } from '../state/signal';
import { qSerialize } from '../util/qdev';

/**
 * @internal
 */
export const _fnSignal = <T extends (...args: any[]) => any>(
  fn: T,
  args: any[],
  fnStr?: string
) => {
  return new SignalDerived(fn, args, fnStr);
};

export const serializeDerivedSignalFunc = (signal: SignalDerived) => {
  const fnBody = qSerialize ? signal.$funcStr$ : 'null';
  assertDefined(fnBody, 'If qSerialize is true then fnStr must be provided.');
  const args = signal.$args$.map((_, i) => `p${i}`).join(',');
  return `(${args})=>(${fnBody})`;
};
