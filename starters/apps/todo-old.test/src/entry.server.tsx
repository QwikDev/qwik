import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { Root } from './root';

/**
 * Qwik server-side render function.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, opts);
}
