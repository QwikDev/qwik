import { routeLoader$ } from "@qwik.dev/router";

export const usePlugin = routeLoader$(() => {
  return {
    message: "works",
  };
});
