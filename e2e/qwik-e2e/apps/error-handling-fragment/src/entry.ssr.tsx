import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

/** Serves the standalone container the multi-container route inlines; the host page owns the loader. */
export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    containerTagName: 'container',
    qwikLoader: { include: 'never' },
    ...opts,
    streaming: { ...opts.streaming, outOfOrder: false },
  });
}
