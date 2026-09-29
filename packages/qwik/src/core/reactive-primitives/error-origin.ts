import type { ComputedSignalImpl } from './impl/computed-signal-impl';

type ErrorOrigin = ComputedSignalImpl<unknown, any>;

const errorOrigins = /*#__PURE__*/ new WeakMap<object, ErrorOrigin>();

const MAX_CAUSE_DEPTH = 8;

const findTaggedError = (error: unknown): object | undefined => {
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }
    if (errorOrigins.has(error)) {
      return error;
    }
    try {
      error = (error as { cause?: unknown }).cause;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const getErrorOrigin = (error: unknown): ErrorOrigin | undefined => {
  const taggedError = findTaggedError(error);
  const origin = taggedError && errorOrigins.get(taggedError);
  return origin && origin.$untrackedError$ === taggedError ? origin : undefined;
};

export const getStillFailingOrigin = (error: unknown): ErrorOrigin | undefined => {
  const taggedError = findTaggedError(error);
  const origin = taggedError && errorOrigins.get(taggedError);
  return origin && origin.$untrackedError$ !== undefined ? origin : undefined;
};

export const setErrorOrigin = (error: unknown, origin: ErrorOrigin): void => {
  if (typeof error === 'object' && error !== null) {
    errorOrigins.set(error, origin);
  }
};
