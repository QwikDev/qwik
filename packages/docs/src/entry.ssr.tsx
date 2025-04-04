import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    qwikLoader: {
      // The docs can be long so make sure to intercept events before the end of the document.
      position: 'top',
    },
    ...opts,
    containerAttributes: {
      lang: 'en',
      ...opts.containerAttributes,
    },
  });
}
