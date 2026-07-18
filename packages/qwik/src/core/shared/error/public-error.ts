/**
 * A deliberately public error: constructing one is consent to serialize and display its `data`
 * through an `<ErrorBoundary>` fallback, unredacted, even in production. Any other thrown value is
 * redacted to a generic message in production.
 *
 * `.message` is the human string, `.data` the structured payload: a string `data` doubles as the
 * message, and an object `data` with a string `message` field lifts it onto `.message`.
 *
 * Contract details:
 *
 * - Consent covers the whole instance: every own enumerable field serializes with it, so keep the
 *   payload in `data`.
 * - A configured `transformError` render option runs first and its projection wins — return the
 *   received `PublicError` unchanged to keep it public.
 * - If `data` cannot serialize, the error is redacted to the generic message when it crosses the SSR
 *   boundary (a client-thrown one still displays in place).
 * - A subclass instance resumes as a base `PublicError`: discriminate on `data`, not the subclass.
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
