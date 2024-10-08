import { WrappedSignal } from '../../signal/signal';

/** @internal */
export const _fnSignal = <T extends (...args: any) => any>(
  fn: T,
  args: Parameters<T>,
  fnStr?: string
) => {
  return new WrappedSignal(null, fn, args, fnStr || null);
};
