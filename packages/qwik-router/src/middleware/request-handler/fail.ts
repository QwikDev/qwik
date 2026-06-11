import { ServerError } from './server-error';

/**
 * Brand for values produced by `requestEv.fail()`. A symbol stored non-enumerably so that user data
 * can never accidentally (or maliciously, via JSON) look like a failed result — unlike v1's
 * `failed: true` structural check. `Symbol.for` so the brand survives this module being bundled
 * into multiple chunks (core vs middleware builds).
 *
 * @public
 */
export const FailBrand: unique symbol = Symbol.for('qwik.fail') as never;

/** Metadata carried by a fail result, hidden under the {@link FailBrand} symbol. */
export interface FailMeta {
  status: number;
}

/**
 * Marker for results produced by `requestEv.fail()`.
 *
 * @public
 */
export type Failed = { readonly [FailBrand]: FailMeta };

/**
 * A typed failure result returned from a loader/action via `requestEv.fail(status, data)`. The
 * framework converts it into the loader/action `.error` state (a `ServerError`) and excludes it
 * from the `.value` type.
 *
 * @public
 */
export type FailReturn<T> = T & Failed;

/**
 * Removes fail branches from a loader/action return union — `.value` is the success type only.
 *
 * @public
 */
export type ExcludeFail<T> = T extends Failed ? never : T;

/**
 * Extracts the payload types of the fail branches of a loader/action return union. These flow into
 * the ERROR type parameter so `.error` is fully typed.
 *
 * @public
 */
export type FailPayload<T> = T extends Failed ? Omit<T, typeof FailBrand> : never;

/**
 * Creates a fail result. Pure: the HTTP status is carried on the brand and only applied to the
 * response when the framework converts the result into the `.error` state, so a `fail()` that is
 * created but never returned has no effect.
 */
export function failReturn<T extends Record<string, any>>(status: number, data: T): FailReturn<T> {
  // Copy so later mutation of `data` can't change what gets serialized, and so a re-returned
  // fail result loses its old brand (enumerable own props only).
  const result = { ...data };
  Object.defineProperty(result, FailBrand, {
    value: { status } satisfies FailMeta,
    enumerable: false,
  });
  return result as FailReturn<T>;
}

/** Checks for the {@link FailBrand}. Only `failReturn()` can produce a matching value. */
export function isFailReturn(value: unknown): value is FailReturn<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && FailBrand in value;
}

/** Reads the status carried by a fail result. */
export function getFailMeta(value: Failed): FailMeta {
  return value[FailBrand];
}

/**
 * Converts a returned fail result into the `ServerError` that surfaces as the loader/action
 * `.error` state. The single conversion point for all fail producers.
 */
export function failToServerError(value: FailReturn<Record<string, any>>): ServerError {
  // Enumerable own props only — drops the non-enumerable brand.
  const { ...payload } = value;
  return new ServerError(getFailMeta(value).status, payload);
}

/**
 * Applies a failure's response effects: the HTTP status and the Cache-Control hygiene that v1's
 * `fail()` guaranteed (failure responses must never be cached). Callers that must keep a 200
 * envelope (the q-loader endpoint) delete Cache-Control themselves instead.
 */
export function applyFailureResponse(
  requestEv: { status: (statusCode?: number) => number; headers: Headers },
  err: ServerError
): void {
  requestEv.status(err.status);
  requestEv.headers.delete('Cache-Control');
}
