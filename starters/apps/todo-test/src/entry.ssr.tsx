import {
  renderToStream,
  type RenderToStreamOptions,
} from "@builder.io/qwik/server";
import { Root } from "./root";

/**
 * Server-Side Render method to be called by a server.
 */
export default function (opts: RenderToStreamOptions) {
  // Render the Root component to a string
  // Pass in the manifest that was generated from the client build
  return renderToStream(<Root />, opts);
}
