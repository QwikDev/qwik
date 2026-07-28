/**
 * An error meant to be seen: an `<ErrorBoundary>` fallback displays a `PublicError` unredacted,
 * even in production, where any other thrown value becomes a generic message.
 *
 * A string `data` doubles as `.message`; an object `data` with a string `message` field lifts it
 * onto `.message`. Consent covers the whole instance, so keep secrets off it.
 *
 * The framework never serializes the boundary error, so `data` only has to serialize if your own
 * code captures it (props, QRLs, stores). A subclass instance resumes as a base `PublicError`:
 * discriminate on `data`, not the subclass.
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
