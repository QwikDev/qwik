import { ServerError } from './server-error';

/**
 * Brand for values produced by `requestEv.fail()`. Non-enumerable and `Symbol.for` so JSON/user
 * data can't spoof a failure and the brand survives duplicate bundling.
 *
 * @public
 */
export const FailBrand: unique symbol = Symbol.for('qwik.fail') as never;

/**
 * Metadata carried by a fail result, hidden under the {@link FailBrand} symbol.
 *
 * @public
 */
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
 * A typed failure result returned from a loader/action via `requestEv.fail(status, data)`. It
 * surfaces as the loader/action `.error` state and is excluded from the `.value` type.
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
 * Extracts the payload types of the fail branches of a loader/action return union.
 *
 * @public
 */
export type FailPayload<T> = T extends Failed
  ? { [K in keyof T as K extends typeof FailBrand ? never : K]: T[K] }
  : never;

export function failReturn<T extends Record<string, any>>(status: number, data: T): FailReturn<T> {
  const result = { ...data };
  Object.defineProperty(result, FailBrand, {
    value: { status } satisfies FailMeta,
    enumerable: false,
  });
  return result as FailReturn<T>;
}

export function isFailReturn(value: unknown): value is FailReturn<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && FailBrand in value;
}

export function getFailMeta(value: Failed): FailMeta {
  return value[FailBrand];
}

export function failToServerError(value: FailReturn<Record<string, any>>): ServerError {
  const { ...payload } = value;
  return new ServerError(getFailMeta(value).status, payload);
}

export function applyFailureResponse(
  requestEv: { status: (statusCode?: number) => number; headers: Headers },
  err: ServerError
): void {
  requestEv.status(err.status);
  requestEv.headers.delete('Cache-Control');
}
