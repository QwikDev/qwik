import type { PreloaderOptions, RenderToStreamOptions } from '@builder.io/qwik/server';
import { renderToStream } from '@builder.io/qwik/server';
import Root from './root';

// You can pass these as query parameters, as well as `preloadDebug`
const preloaderSettings = ['ssrPreloads', 'ssrPreloadProbability', 'maxIdlePreloads'] as const;

export default function (opts: RenderToStreamOptions) {
  const { serverData } = opts;
  const urlStr = serverData?.url;
  if (urlStr) {
    const { searchParams } = new URL(urlStr);
    if (searchParams.size) {
      const newOpts = {
        ...opts,
        preloader: {
          ...(typeof opts.preloader === 'object' ? opts.preloader : undefined),
        },
      } as Omit<RenderToStreamOptions, 'preloader'> & { preloader: PreloaderOptions };
      if (searchParams.has('preloaderDebug')) {
        newOpts.preloader!.debug = true;
      }
      for (const type of preloaderSettings) {
        if (searchParams.has(type)) {
          newOpts.preloader[type] = Number(searchParams.get(type));
        }
      }
      opts = newOpts;
    }
  }
  return renderToStream(<Root />, {
    ...opts,
    containerAttributes: {
      lang: 'en',
      ...opts.containerAttributes,
    },
  });
}
