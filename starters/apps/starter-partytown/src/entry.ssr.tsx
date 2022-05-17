import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import { Root } from './root';

/**
 * Qwik server-side render function.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, {
    ...opts,
    manifest,
    qwikLoader: {
      events: ['click', 'keyup', 'expensiveComputationDone'],
    },
  });
}
