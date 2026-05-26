import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { ProductCard } from './routes/product-card';
import { getPricing, getProduct, getSegment } from './routes/products.server';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-cache-registry-app',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-cache-registry-app-component',
    },
  },

  optimize: {
    resources: {
      getProduct: {
        target: getProduct,
        policy: 'productResource',
        vary: [getSegment],
      },
      getPricing: {
        target: getPricing,
        policy: 'productResource',
        vary: [getSegment],
      },
    },

    components: {
      ProductCard: {
        target: ProductCard,
        policy: 'privateProductCard',
        vary: [getSegment, getProduct],
      },
    },
  },
});

configureCache(cacheConfig);
