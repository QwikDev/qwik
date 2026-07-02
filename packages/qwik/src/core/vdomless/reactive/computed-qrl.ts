import type { QRLInternal } from '../../shared/qrl/qrl-class';
import { isPromise } from '../../shared/utils/promises';
import { Computed } from './computed';
import { registerSubscriberToOwner } from '../runtime/owner';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { ContainerContext } from '../runtime/container-context';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import { getFunctionOrResolve } from '../utils/qrl';

export type ComputedQrlFn<T> = () => T;
export type ComputedQrlRef<T> = QRLInternal<ComputedQrlFn<T>>;

export class ComputedQrl<T> extends Computed<T> {
  constructor(
    readonly computeQrl: ComputedQrlRef<T>,
    readonly container?: ContainerContext
  ) {
    super(computeQrlValue);
  }
}

export function createComputedQrl<T>(
  computeQrl: ComputedQrlRef<T>,
  container?: ContainerContext
): ComputedQrl<T> {
  const contextContainer = container ?? getActiveInvokeContextOrNull()?.container;
  const computed = new ComputedQrl(computeQrl, contextContainer);
  void computed.computeQrl.resolve(contextContainer).catch(() => {});
  return registerSubscriberToOwner(computed);
}

export const useComputed$: <T>(qrl: () => T) => Computed<T> = /*#__PURE__*/ implicit$FirstArg(
  createComputedQrl as any
);

function computeQrlValue<T>(this: ComputedQrl<T>): T {
  const compute = getFunctionOrResolve(this.computeQrl, this.container);

  if (isPromise(compute)) {
    throw compute;
  }

  const value = compute();
  if (isPromise(value)) {
    throw new Error('Computed QRL must be synchronous');
  }

  return value;
}
