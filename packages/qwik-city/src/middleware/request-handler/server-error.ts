/** @public */
export class ServerError<T = any> extends Error {
  constructor(
    public status: number,
    public data: T
  ) {
    super(typeof data === 'string' ? data : undefined);
  }
}
/** @deprecated */

export class ErrorResponse extends ServerError {
  constructor(
    public status: number,
    message?: string
  ) {
    super(status, message);
  }
}
