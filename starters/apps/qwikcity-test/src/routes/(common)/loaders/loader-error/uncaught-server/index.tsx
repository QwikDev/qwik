import { component$ } from "@builder.io/qwik";
import { routeLoader$, server$ } from "@builder.io/qwik-city";
import { ServerError } from "@builder.io/qwik-city/middleware/request-handler";

export const serverError = server$(() => {
  throw new ServerError(401, "server-error-data");
});

const useCatchServerErrorInLoader = routeLoader$(async () => {
  await serverError();
});

export default component$(() => {
  useCatchServerErrorInLoader();
  return <></>;
});
