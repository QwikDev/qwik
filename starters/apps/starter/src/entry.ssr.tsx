import { renderToString, RenderOptions } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import { Root } from './root';

/**
 * Server-Side Render method to be called by a server.
 */
export function render(opts?: RenderOptions) {
  // Render the Root component to a string
  // Pass in the manifest that was generated from the client build
  return renderToString(<Root />, {
    manifest,
    ...opts,
  });
}
