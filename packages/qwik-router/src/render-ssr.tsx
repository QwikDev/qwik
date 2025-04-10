import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import { manifest } from '@qwik-client-manifest';
import { Root } from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: 'en-us',
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
