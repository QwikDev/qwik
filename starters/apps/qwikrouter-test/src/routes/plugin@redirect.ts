import type { RequestEvent } from "@qwik.dev/router";

export const onGet = (ev: RequestEvent) => {
  if (ev.url.pathname === "/qwikrouter-test/redirectme/") {
    throw ev.redirect(301, "/qwikrouter-test/");
  }
};
