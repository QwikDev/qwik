/**
 * A deliberately public error: constructing one is consent to serialize and display its `data`
 * through an `<ErrorBoundary>` fallback, unredacted, even in production. Any other thrown value is
 * redacted to a generic message in production.
 *
 * `.message` is the human string, `.data` the structured payload: a string `data` doubles as the
 * message, and an object `data` with a string `message` field lifts it onto `.message`.
 *
 * @public
 * @experimental
 */
export class PublicError<T = unknown> extends Error {
  constructor(public data: T) {
    super(
      typeof data === 'string'
        ? data
        : typeof (data as { message?: unknown })?.message === 'string'
          ? (data as { message: string }).message
          : 'Server error'
    );
  }
}

/** Serialized-payload consent marker; inflate restores the class when it sees it. @internal */
export const QPublicErrorMarker = 'q:pe';

/** Classification that survives hostile values (revoked Proxy, throwing traps). @internal */
export const isPublicError = (value: unknown): value is PublicError => {
  try {
    return value instanceof PublicError;
  } catch {
    return false;
  }
};
