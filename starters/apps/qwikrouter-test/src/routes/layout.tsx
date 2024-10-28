import { routeLoader$, type RequestHandler } from "@qwik.dev/router";
import { component$, Slot } from "@qwik.dev/core";
import { isUserAuthenticated } from "../auth/auth";

export const useUserLoader = routeLoader$(async ({ cookie }) => {
  return {
    isAuthenticated: await isUserAuthenticated(cookie),
  };
});

export const onGet: RequestHandler = ({ locale, headers, sharedMap }) => {
  // cache for a super long time of 10 seconds for pages using this layout
  locale("en-US");
  headers.set("Cache-Control", "max-age=10");
  sharedMap.set("root", "from root");
};

export default component$(() => {
  return <Slot />;
});
