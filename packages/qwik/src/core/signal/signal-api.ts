import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { Signal } from './signal';
import { ComputedSignal } from './computed-signal';
import { throwIfQRLNotResolved } from './signal-utils';

export const createSignal = <T>(value?: T) => {
  return new Signal(null, value);
};

export const createComputedSignal = <T>(qrl: QRL<() => T>) => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignal(null, qrl as QRLInternal<() => T>);
};
