import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';

/**
 * Server-Side Render method to be called by a server.
 */
export async function renderToString(
  rootNode: any,
  opts?: RenderToStringOptions
): Promise<RenderToStringResult> {
  // Render the Root component to a string
  // Pass in the manifest that was generated from the client build
  const mod = await import('../react/server');
  const result = await mod.renderToString(rootNode, opts);
  const styles = mod.getGlobalStyleTag(result.html);
  const finalHtml = styles + result.html;
  return {
    ...result,
    html: finalHtml,
  };
}
