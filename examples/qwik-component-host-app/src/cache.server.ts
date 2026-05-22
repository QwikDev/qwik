import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { getRemoteProduct, getRemoteSegment } from './routes/remote.server';
import { RemoteProductTile } from './routes/remote-tile';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-host-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-host-component',
    },
  },
  optimize: {
    resources: {
      getRemoteSegment: {
        target: getRemoteSegment,
        policy: 'trustedOrigin',
      },
      getRemoteProduct: {
        target: getRemoteProduct,
        policy: 'trustedOriginProduct',
        serialize: 'value',
        vary: [getRemoteSegment],
      },
    },
    components: {
      RemoteProductTile: {
        target: RemoteProductTile,
        policy: 'trustedOriginTile',
        vary: [getRemoteSegment, getRemoteProduct],
      },
    },
  },
});

configureCache(cacheConfig);
