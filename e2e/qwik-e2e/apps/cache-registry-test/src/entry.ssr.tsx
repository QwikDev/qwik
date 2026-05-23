import './cache.server';
import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    base: '/cache-registry-test/build/',
    ...opts,
    // This fixture isolates the cache-registry/server$ path. OOOS has its own e2e coverage, and
    // enabling it here changes the resume timing for the client RPC assertion.
    streaming: {
      ...opts.streaming,
      outOfOrder: false,
    },
  });
}
