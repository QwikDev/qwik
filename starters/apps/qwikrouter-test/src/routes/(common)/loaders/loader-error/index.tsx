import { component$ } from "@qwik.dev/core";
import { routeLoader$ } from "@qwik.dev/router";

const useError = routeLoader$(async function ({ error }): Promise<string> {
  throw error(401, "loader-error-uncaught");
});

export default component$(() => {
  useError();
  return <></>;
});
