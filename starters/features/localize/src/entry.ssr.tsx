/**
 * WHAT IS THIS FILE?
 *
 * SSR renderer function, used by Qwik Router.
 *
 * Note that this is the only place the Qwik renderer is called.
 * On the client, containers resume and do not call render.
 */
import { createRenderer } from "@qwik.dev/router";
import Root from "./root";
import { extractBase } from "./routes/[locale]/i18n-utils";

export default createRenderer((opts) => {
  return {
    jsx: <Root />,
    options: {
      ...opts,
      base: extractBase, // determine the base URL for the client code
      // Use container attributes to set attributes on the html tag.
      containerAttributes: {
        lang: opts.serverData?.locale ?? "en-us",
        ...opts.containerAttributes,
      },
    },
  };
});
