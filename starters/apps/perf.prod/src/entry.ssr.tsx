import { renderToStream, RenderToStreamOptions } from "@qwik.dev/core/server";
import { Root } from "./root";

/**
 * Server-Side Render method to be called by a server.
 */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.serverData!.url);
  return renderToStream(
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Root pathname={url.pathname} />
      </body>
    </>,
    opts,
  );
}
