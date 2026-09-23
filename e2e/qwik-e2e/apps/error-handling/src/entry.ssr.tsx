import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  const url = opts.serverData?.url ? new URL(opts.serverData.url) : undefined;
  const outOfOrder = url?.searchParams.get('outOfOrder') !== 'false';
  const inOrderDirect = url?.searchParams.get('inOrderStrategy') === 'direct';
  return renderToStream(<Root />, {
    base: '/error-handling/build/',
    ...opts,
    streaming: {
      ...opts.streaming,
      outOfOrder,
      ...(inOrderDirect ? { inOrder: { strategy: 'direct' as const } } : undefined),
    },
  });
}
