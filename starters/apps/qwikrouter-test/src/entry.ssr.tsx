import { manifest } from "@qwik-client-manifest";
import {
  renderToStream,
  type RenderToStreamOptions,
} from "@qwik.dev/core/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    base: "/qwikrouter-test/build/",
    ...opts,
  });
}
