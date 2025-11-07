import type { RequestEvent } from "@builder.io/qwik-city";

export const onGet = (ev: RequestEvent) => {
  if (ev.url.pathname === "/qwikcity-test/redirectme/") {
    throw ev.redirect(301, "/qwikcity-test/");
  }
};
