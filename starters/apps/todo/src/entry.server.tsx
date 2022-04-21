import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { Root } from './root';

/**
 * Entry point for server-side rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, opts);
}
