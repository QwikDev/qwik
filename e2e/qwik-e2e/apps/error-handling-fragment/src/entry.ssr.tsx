import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    containerTagName: 'container',
    qwikLoader: { include: 'never' },
    ...opts,
    streaming: { ...opts.streaming, outOfOrder: false },
  });
}
