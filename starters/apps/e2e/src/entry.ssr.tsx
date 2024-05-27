import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import { Root } from "./root";

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.serverData!.url);

  // Render segment instead
  if (url.searchParams.has("fragment")) {
    return renderToStream(
      <>
        <Root pathname={url.pathname} />
      </>,
      {
        debug: true,
        containerTagName: "container",
        // streaming: {
        //   inOrder: {
        //     buffering: 'marks',
        //   },
        // },
        qwikLoader: {
          include:
            url.searchParams.get("loader") === "false" ? "never" : "auto",
        },
        ...opts,
      },
    );
  }

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
    {
      debug: true,
      ...opts,
    },
  );
}
