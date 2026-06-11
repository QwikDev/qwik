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
      Object.assign(this, data);
    }
    this.status = status;
    this.data = data;
  }
}

/**
 * An error thrown from a loader/action (via `throw error(status, data)`) or produced by a failed
 * validator. `status` is the HTTP status, `message` is the string payload (or the payload's
 * `message` field), and an object payload's fields are exposed directly on the error (e.g.
 * `error.fieldErrors`). `.data` is the canonical payload that was passed to `error()`.
 *
 * @public
 */
export type ServerError<T = unknown> = ServerErrorImpl<T> & (T extends object ? T : unknown);

/** @public */
export const ServerError = ServerErrorImpl as {
  new <T = unknown>(status: number, data: T): ServerError<T>;
  readonly prototype: ServerErrorImpl;
};
