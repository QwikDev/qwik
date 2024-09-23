import type { QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import { ComputedSignal, Signal, throwIfQRLNotResolved } from './v2-signal';

export const createSignal = <T>(value?: T) => {
  return new Signal(null, value);
};

export const createComputedSignal = <T>(qrl: QRL<() => T>) => {
  throwIfQRLNotResolved(qrl);
  return new ComputedSignal(null, qrl as QRLInternal<() => T>);
};
