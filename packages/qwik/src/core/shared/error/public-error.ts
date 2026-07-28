/**
 * A deliberately public error: constructing one is consent to display its `data` through an
 * `<ErrorBoundary>` fallback, unredacted, even in production. Any other thrown value is redacted to
 * a generic message in production.
 *
 * `.message` is the human string, `.data` the structured payload: a string `data` doubles as the
 * message, and an object `data` with a string `message` field lifts it onto `.message`.
 *
 * Contract details:
 *
 * - Consent covers the whole instance: no field is redacted, so keep the payload in `data` and
 *   secrets off the error.
 * - A configured `transformError` render option runs first and its projection wins — return the
 *   received `PublicError` unchanged, or return `undefined` to apply the default policy, which
 *   keeps it public.
 * - The framework never serializes the boundary error; `data` crosses the wire only inside your own
 *   captures (props, QRLs, stores) and must serialize there.
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

export const QPublicErrorMarker = 'q:pe';

export const isPublicError = (value: unknown): value is PublicError => {
  try {
    return value instanceof PublicError;
  } catch {
    return false;
  }
};
