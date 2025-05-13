import { component$ } from "@qwik.dev/core";
import { routeLoader$, server$ } from "@qwik.dev/router";
import { ServerError } from "@qwik.dev/router/middleware/request-handler";

export const serverError = server$(() => {
  throw new ServerError(401, "loader-error-data");
});

const useCatchServerErrorInLoader = routeLoader$(async () => {
  try {
    await serverError();
  } catch (err: any) {
    if (err instanceof ServerError && typeof err.data === "string") {
      return err.data;
    }
  }

  return "unknown error";
});

export default component$(() => {
  const error = useCatchServerErrorInLoader();
  return <div id="server-error">{error.value}</div>;
});
