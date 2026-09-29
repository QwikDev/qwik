import { isDev } from '@qwik.dev/core';
import { AbortMessage } from './redirect-handler';

/**
 * Thrown from middleware or a `blockSSR: true` loader, renders the nearest `error.tsx` at `status`.
 * Thrown anywhere else, it is an ordinary failure: `.error` in a loader or a computed, the nearest
 * `<Catch>` otherwise.
 *
 * @public
 */
export class HttpError<T = any> extends Error {
  constructor(
    public status: number,
    public data: T
  ) {
    super(typeof data === 'string' ? data : undefined);
  }
}

/**
 * The old name of `HttpError`.
 *
 * @deprecated Use `HttpError`.
 * @public
 */
export const ServerError = HttpError;
/**
 * The old name of `HttpError`.
 *
 * @deprecated Use `HttpError`.
 * @public
 */
export type ServerError<T = any> = HttpError<T>;

/** A thrown `Error` other than an `HttpError`: a bug or an outage. */
export const isCrash = (err: unknown): err is Error =>
  err instanceof Error && !(err instanceof HttpError);

/** A crash's message reaches the client only in dev. */
export const getPublicCrashMessage = (err: Error): string =>
  isDev ? `${err.message}\n(this is only visible in dev mode)` : 'Internal Server Error';

/**
 * `ev.redirect()`, `ev.error()`, etc. return a control-flow signal meant to be thrown. Throw it for
 * the user when they return it instead, so returning and throwing behave the same.
 */
export const throwIfControlFlowSignal = (value: unknown): void => {
  if (value instanceof AbortMessage || value instanceof HttpError) {
    throw value;
  }
};
