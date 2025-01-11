import { type RequestHandler } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";
import { isDev } from "@builder.io/qwik/build";
import { isErrorReason } from "./(common)/server-func/server-error";

export const onRequest: RequestHandler = async ({ next, error }) => {
  try {
    return await next();
  } catch (err) {
    // Test error middleware by updating the error data
    if (isServerError(err) && isErrorReason(err.data)) {
      err.data.middleware = "caught";
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
