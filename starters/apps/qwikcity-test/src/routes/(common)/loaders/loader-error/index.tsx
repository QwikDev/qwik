import { component$ } from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";

const useError = routeLoader$(async function ({ error }): Promise<string> {
  throw error(401, "loader-error-uncaught");
});

export default component$(() => {
  useError();
  return <></>;
});
