import { routeLoader$ } from "@qwikdev/city";

export const usePlugin = routeLoader$(() => {
  return {
    message: "works",
  };
});
