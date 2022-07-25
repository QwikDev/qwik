import type { RenderOptions } from '@builder.io/qwik/server';
import { renderToString } from '@builder.io/qwik-react';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

export default function (opts: RenderOptions) {
  return renderToString(<Root />, {
    manifest,
    ...opts,
  });
}
