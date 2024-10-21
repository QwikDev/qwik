import { routeLoader$ } from "@qwik.dev/city";

export const usePlugin = routeLoader$(() => {
  return {
    message: "works",
  };
});
