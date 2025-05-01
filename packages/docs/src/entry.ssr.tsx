import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

// You can pass these as query parameters, as well as `preloadDebug`
const preloaderSettings = [
  'maxPreloads',
  'minProbability',
  'maxSimultaneousPreloads',
  'minPreloadProbability',
] as const;

export default function (opts: RenderToStreamOptions) {
  const { serverData } = opts;
  const urlStr = serverData?.url;
  if (urlStr) {
    const { searchParams } = new URL(urlStr);
    if (searchParams.size) {
      opts = {
        ...opts,
        prefetchStrategy: {
          ...opts.prefetchStrategy,
          implementation: { ...opts.prefetchStrategy?.implementation },
        },
      };
      if (searchParams.has('preloadDebug')) {
        opts.prefetchStrategy!.implementation!.debug = true;
      }
      for (const type of preloaderSettings) {
        if (searchParams.has(type)) {
          opts.prefetchStrategy!.implementation![type] = Number(searchParams.get(type));
        }
      }
    }
  }
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
