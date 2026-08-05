import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    base: '/server-only-modules/build/',
    ...opts,
  });
}
