import { createSignal, type Signal } from '../reactive-primitives/signal.public';
import { QCursorBoundary } from '../shared/utils/markers';
import { useInvokeContext } from './use-core';
import { useConstant } from './use-signal';

/** @internal */
export interface CursorBoundary {
  __brand: 'cursor-boundary';
  pending: Signal<number>;
  version: Signal<number>;
}

const createCursorBoundary = (): CursorBoundary => {
  return {
    __brand: 'cursor-boundary',
    pending: createSignal(0),
    version: createSignal(0),
  };
};

/** @internal */
export const useCursorBoundary = (): CursorBoundary => {
  const boundary = useConstant(createCursorBoundary);
  const iCtx = useInvokeContext();
  iCtx.$container$.setHostProp(iCtx.$hostElement$!, QCursorBoundary, boundary);
  return boundary;
};

/** @internal */
export const isCursorBoundary = (value: unknown): value is CursorBoundary => {
  return !!value && (value as CursorBoundary).__brand === 'cursor-boundary';
};
