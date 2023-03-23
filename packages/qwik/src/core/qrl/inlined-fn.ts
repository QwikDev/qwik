import { isServer } from '@builder.io/qwik/build';
import type { MustGetObjID } from '../container/container';
import { assertDefined } from '../error/assert';
import { isServerPlatform } from '../platform/platform';
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

export const serializeDerivedSignal = (signal: SignalDerived, getObjID: MustGetObjID) => {
  const parts = signal.$args$.map(getObjID);
  const fnBody = qSerialize ? signal.$funcStr$ : 'null';
  assertDefined(fnBody, 'If qSerialize is true then fnStr must be provided.');
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
