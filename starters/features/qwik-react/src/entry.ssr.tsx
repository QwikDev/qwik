import type { RenderToStreamOptions } from '@builder.io/qwik/server';
import { renderToStream } from '@builder.io/qwik-react';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
  });
}
