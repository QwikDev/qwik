import { renderToStream, RenderToStreamOptions } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

export function render(opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
  });
}
