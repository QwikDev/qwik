import { type RequestHandler } from "@qwik.dev/router";
import { ServerError } from "@qwik.dev/router/middleware/request-handler";
import { isErrorReason } from "./(common)/server-func/server-error";

export const onRequest: RequestHandler = async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    // Intercept and update ServerErrors to test middleware
    if (err instanceof ServerError) {
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
