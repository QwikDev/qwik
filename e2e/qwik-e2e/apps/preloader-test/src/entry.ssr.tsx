/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point, in all cases the application is rendered outside the browser, this entry point
 * will be the common one.
 *
 * - Server (express, cloudflare...)
 * - Npm run start
 * - Npm run preview
 * - Npm run build
 */
import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

const requestedMaxIdlePreloads = (opts: RenderToStreamOptions) => {
  const url = opts.serverData?.url;
  return url ? Number(new URL(url).searchParams.get('maxIdlePreloads') ?? 1) : 1;
};

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    preloader: {
      ssrPreloads: 0,
      maxIdlePreloads: requestedMaxIdlePreloads(opts),
    },
    qwikLoader: 'inline',
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: 'en-us',
      ...opts.containerAttributes,
    },
    serverData: {
      ...opts.serverData,
    },
  });
}
