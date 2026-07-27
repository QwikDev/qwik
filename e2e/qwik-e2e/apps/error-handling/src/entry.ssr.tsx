import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

/** Out-of-order streaming by default; `?outOfOrder=false` forces in-order for swap-timing rows. */
export default function (opts: RenderToStreamOptions) {
  const url = opts.serverData?.url ? new URL(opts.serverData.url) : undefined;
  const outOfOrder = url?.searchParams.get('outOfOrder') !== 'false';
  return renderToStream(<Root />, {
    base: '/error-handling/build/',
    ...opts,
    streaming: {
      ...opts.streaming,
      outOfOrder,
    },
  });
}
