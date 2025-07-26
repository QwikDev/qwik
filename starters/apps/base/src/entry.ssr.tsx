/**
 * WHAT IS THIS FILE?
 *
 * SSR renderer function, used for all build/dev targets except client-only.
 *
 * Note that except for client-only, this is the only place the Qwik renderer is called.
 * On the client, containers resume and do not call render.
 */
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@qwik.dev/core/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: "en-us",
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
