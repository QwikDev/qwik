import { component$ } from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";

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
