import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';

/** @internal */
export const _fnSignal = <T extends (...args: any) => any>(
  fn: T,
  args: Parameters<T>,
  fnStr?: string
) => {
  return new WrappedSignalImpl(null, fn, args, fnStr || null);
};
