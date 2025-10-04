import { renderToStream, RenderToStreamOptions } from "@qwik.dev/core/server";
import { Root } from "./root";

/**
 * Qwik server-side render function.
 */
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, opts);
}
