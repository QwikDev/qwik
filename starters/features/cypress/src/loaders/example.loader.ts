import { routeLoader$ } from "@qwik.dev/router";

export const useExampleLoader = routeLoader$(() => {
  return "This is example loader data.";
});
