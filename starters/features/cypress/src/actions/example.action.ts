import { routeAction$ } from "@builder.io/qwik-city";

export const useExampleAction = routeAction$(() => {
  return "This is example action data.";
});
