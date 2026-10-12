import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  const url = opts.serverData?.url ? new URL(opts.serverData.url) : undefined;
  return renderToStream(<Root />, {
    ...opts,
    base: '/catch-render/build/',
    outOfOrder: url?.searchParams.get('outOfOrder') !== 'false',
  });
}
