import { WrappedSignal } from '../v2/signal/v2-signal';

/** @internal */
export const _fnSignal = <T extends (...args: any) => any>(
  fn: T,
  args: Parameters<T>,
  fnStr?: string
) => {
  return new WrappedSignal(null, fn, args, fnStr || null);
};
