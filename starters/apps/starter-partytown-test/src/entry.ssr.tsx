import { manifest } from "@qwik-client-manifest";
import { RenderOptions, renderToStream } from "@qwik.dev/core/server";
import Root from "./root";

/**
 * Qwik server-side render function.
 */
export default function (opts: RenderOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
  });
}
