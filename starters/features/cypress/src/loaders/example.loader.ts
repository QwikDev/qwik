import { routeLoader$ } from "@builder.io/qwik-city";

export const useExampleLoader = routeLoader$(() => {
  return "This is example loader data.";
});
