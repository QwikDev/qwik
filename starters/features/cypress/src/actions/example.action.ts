import { routeAction$ } from "@qwik.dev/router";

export const useExampleAction = routeAction$(() => {
  return "This is example action data.";
});
