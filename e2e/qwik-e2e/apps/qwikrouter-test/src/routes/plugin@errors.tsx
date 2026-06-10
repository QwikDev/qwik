import { type RequestHandler } from '@qwik.dev/router';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
import { isErrorReason } from './(common)/server-func/server-error';

export const onRequest: RequestHandler = async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    // Intercept and update ServerErrors to test middleware.
    // Note: loader failures (fail() / throw error()) no longer propagate here — they are
    // captured per-loader and surfaced as `loader.error`, so middleware can't intercept them.
    if (err instanceof ServerError) {
      // Update for (common)/server-func/server-error
      if (isErrorReason(err.data)) {
        err.data.middleware = 'server-error-caught';
      }
    }

    throw err;
  }
};
