import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from '@builder.io/qwik/server';

/**
 * Server-Side Render to string method to be called by a server.
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
  const finalHtml = result.html.replace('</head>', styles + '</head>');
  return {
    ...result,
    html: finalHtml,
  };
}

/**
 * Server-Side Render to stream method to be called by a server.
 */
export async function renderToStream(
  rootNode: any,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> {
  const result = await renderToString(rootNode, opts);
  opts.stream.write(result.html);
  return {
    prefetchResources: result.prefetchResources,
    snapshotResult: result.snapshotResult,
    _symbols: result._symbols,
    manifest: result.manifest,
    flushes: 1,
    size: result.html.length,
    timing: {
      firstFlush: result.timing.render,
      render: result.timing.render,
      snapshot: result.timing.snapshot,
    },
  };
}
