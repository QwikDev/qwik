import { type RequestHandler } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";
import { isDev } from "@builder.io/qwik/build";
import { isErrorReason } from "./(common)/server-func/server-error";

export const onRequest: RequestHandler = async ({ next, error }) => {
  try {
    return await next();
  } catch (err) {
    // Intercept and update ServerErrors to test middleware
    if (isServerError(err)) {
      // Update for (common)/server-func/server-error
      if (isErrorReason(err.data)) {
        err.data.middleware = "server-error-caught";
      }

      // Update for (common)/loaders/loader-error
      if (err.data === "loader-error-uncaught") {
        err.data = "loader-error-caught";
      }
    }

    throw err;
  }
};

function isServerError(err: unknown): err is ServerError {
  return (
    err instanceof ServerError ||
    (isDev && err instanceof Error && err.constructor.name === "ServerError")
  );
}
