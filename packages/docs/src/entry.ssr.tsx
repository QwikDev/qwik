import { renderToStream, type RenderToStreamOptions } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    qwikLoader: {
      // The docs can be long so make sure to intercept events before the end of the document.
      position: 'top',
    },
    ...opts,
    containerAttributes: {
      lang: 'en',
      ...opts.containerAttributes,
    },
    // Core Web Vitals experiment until October 9: Do not remove! Reach out to @maiieul first if you believe you have a good reason to change this.
    prefetchStrategy: {
      implementation: {
        linkInsert: 'html-append',
        linkRel: 'modulepreload',
      },
    },
    // Core Web Vitals experiment until October 9: Do not remove! Reach out to @maiieul first if you believe you have a good reason to change this.
    qwikPrefetchServiceWorker: {
      include: false,
    },
  });
}
