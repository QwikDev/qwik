import { isServer } from '@builder.io/qwik/build';
import type { MustGetObjID } from '../container/container';
import { isServerPlatform } from '../platform/platform';

export class SignalDerived<T = any, ARGS extends any[] = any> {
  constructor(public $func$: (...args: ARGS) => T, public $args$: ARGS, public $funcStr$: string) {}

  get value(): T {
    return this.$func$.apply(undefined, this.$args$);
  }
}

/**
 * @alpha
 */
export const _fnSignal = <T extends (...args: any[]) => any>(fn: T, args: any[], fnStr: string) => {
  return new SignalDerived(fn, args, fnStr);
};

export const serializeDerivedSignal = (signal: SignalDerived, getObjID: MustGetObjID) => {
  const parts = signal.$args$.map(getObjID);
  const fnBody = signal.$funcStr$;
  return parts.join(' ') + ':' + fnBody;
};

export const parseDerivedSignal = (data: string) => {
  if (isServer || isServerPlatform()) {
    throw new Error('For security reasons. Derived signals cannot be deserialized on the server.');
  }
  const colonIndex = data.indexOf(':');
  const objects = data.slice(0, colonIndex).split(' ');
  const fnStr = data.slice(colonIndex + 1);
  const args = objects.map((_, i) => `p${i}`);
  args.push(`return ${fnStr}`);
  const fn = new Function(...args);
  return new SignalDerived(fn as any, objects, fnStr);
};
