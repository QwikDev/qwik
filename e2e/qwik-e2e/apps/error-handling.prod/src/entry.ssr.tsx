import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from '../../error-handling/src/root';

/** Prod twin of the dev entry: same out-of-order default, prod SSR base. */
export default function (opts: RenderToStreamOptions) {
  const url = opts.serverData?.url ? new URL(opts.serverData.url) : undefined;
  const outOfOrder = url?.searchParams.get('outOfOrder') !== 'false';
  return renderToStream(<Root />, {
    base: '/error-handling.prod/build/',
    ...opts,
    streaming: {
      ...opts.streaming,
      outOfOrder,
    },
  });
}
