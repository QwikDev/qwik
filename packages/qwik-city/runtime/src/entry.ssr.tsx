import { RenderOptions, renderToString } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

export default function (opts: RenderOptions) {
  return renderToString(<Root />, {
    manifest,
    ...opts,
  });
}
