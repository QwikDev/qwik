import { routeLoader$ } from "@builder.io/qwik-city";

export const usePlugin = routeLoader$(() => {
  return {
    message: "works",
  };
});
