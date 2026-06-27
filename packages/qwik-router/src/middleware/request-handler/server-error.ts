import { AbortMessage } from './redirect-handler';

/** @public */
export class ServerError<T = any> extends Error {
  constructor(
    public status: number,
    public data: T
  ) {
    super(typeof data === 'string' ? data : undefined);
  }
}

/**
 * `ev.redirect()`, `ev.error()`, etc. return a control-flow signal meant to be thrown. Throw it for
 * the user when they return it instead, so returning and throwing behave the same.
 */
export const throwIfControlFlowSignal = (value: unknown): void => {
  if (value instanceof AbortMessage || value instanceof ServerError) {
    throw value;
  }
};
