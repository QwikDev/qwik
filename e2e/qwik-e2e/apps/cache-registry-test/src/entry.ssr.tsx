import './cache.server';
import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    base: '/cache-registry-test/build/',
    ...opts,
  });
}
