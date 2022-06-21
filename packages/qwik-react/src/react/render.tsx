import {
  renderToString as rToString,
  RenderToStringOptions,
  RenderToStringResult,
} from '@builder.io/qwik/server';
import { getGlobalStyleTag } from './server';

/**
 * Server-Side Render method to be called by a server.
 */
export async function renderToString(
  rootNode: any,
  opts?: RenderToStringOptions
): Promise<RenderToStringResult> {
  // Render the Root component to a string
  // Pass in the manifest that was generated from the client build
  const result = await rToString(rootNode, opts);
  const styles = getGlobalStyleTag(result.html);
  const finalHtml = styles + result.html;
  return {
    ...result,
    html: finalHtml,
  };
}
