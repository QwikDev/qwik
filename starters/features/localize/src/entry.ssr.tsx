/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point, in all cases the application is rendered outside the browser, this
 * entry point will be the common one.
 *
 * - Server (express, cloudflare...)
 * - npm run start
 * - npm run preview
 * - npm run build
 *
 */
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import Root from "./root";
import { extractBase } from "./routes/[locale]/i18n-utils";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    base: extractBase, // determine the base URL for the client code
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: opts.serverData?.locale ?? "en-us",
      ...opts.containerAttributes,
    },
  });
}
