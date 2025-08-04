import {
  renderToStream,
  type RenderToStreamOptions,
} from "@qwik.dev/core/server";
import Root from "./root";

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    base: "/qwikrouter-test/build/",
    ...opts,
    serverData: {
      ...opts.serverData,
      // ensure that documentHead injection works
      documentHead: {
        title: "Qwik Router Test",
        meta: [{ name: "hello", content: "world" }],
        scripts: [{ key: "hello", script: 'window.hello = "world";' }],
      },
    },
  });
}
