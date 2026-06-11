/**
 * Payload keys that are never flattened onto the error — payloads can't clobber `Error` fields or
 * the prototype; they stay on `.data`.
 */
const RESERVED_KEYS = new Set([
  'message',
  'name',
  'stack',
  'cause',
  'status',
  'data',
  '__proto__',
  'constructor',
  'prototype',
]);

class ServerErrorImpl<T = unknown> extends Error {
  status: number;
  data: T;
  constructor(status: number, data: T) {
    super(
      typeof data === 'string'
        ? data
        : data &&
            typeof data === 'object' &&
            typeof (data as { message?: unknown }).message === 'string'
          ? ((data as { message?: unknown }).message as string)
          : undefined
    );
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (!RESERVED_KEYS.has(key)) {
          (this as Record<string, unknown>)[key] = (data as Record<string, unknown>)[key];
        }
      }
    }
    this.status = status;
    this.data = data;
  }
}

type ReservedServerErrorKeys = keyof Error | 'cause' | 'status' | 'data';

/**
 * An error produced by a returned `fail(status, data)`, a failed validator, or a thrown
 * `error(status, data)`. `status` is the HTTP status, `message` is the string payload (or the
 * payload's `message` field when it is a string), and an object payload's fields are exposed
 * directly on the error (e.g. `error.fieldErrors`) — except `Error`-reserved keys, which stay on
 * `.data` only. `.data` is the canonical payload.
 *
 * @public
 */
export type ServerError<T = unknown> = ServerErrorImpl<T> &
  (T extends object ? Omit<T, ReservedServerErrorKeys> : unknown);

/** @public */
export const ServerError = ServerErrorImpl as {
  new <T = unknown>(status: number, data: T): ServerError<T>;
  readonly prototype: ServerErrorImpl;
};
