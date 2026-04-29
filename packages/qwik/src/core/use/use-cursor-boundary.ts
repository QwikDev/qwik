import { createSignal, type Signal } from '../reactive-primitives/signal.public';
import { useConstant } from './use-signal';

/** @internal */
export interface CursorBoundary {
  pending: Signal<number>;
  version: Signal<number>;
}

const createCursorBoundary = (): CursorBoundary => {
  return {
    pending: createSignal(0),
    version: createSignal(0),
  };
};

/** @internal */
export const useCursorBoundary = (): CursorBoundary => {
  return useConstant(createCursorBoundary);
};
