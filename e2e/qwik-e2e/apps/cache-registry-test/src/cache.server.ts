import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { ProductCard } from './routes/product-card';
import { getInventory, getPricing, getProduct, getSegment } from './routes/products.server';

const getRequestSegmentForVary = Object.assign(
  function (this: any) {
    return {
      plan: this?.request?.headers?.get('x-cache-plan') === 'pro' ? 'pro' : 'free',
    };
  },
  {
    __qwik_server_resource_hash__: 'cache-registry-e2e-request-segment',
  }
);

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-e2e-cache-registry-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-e2e-cache-registry-component',
    },
  },

  optimize: {
    resources: {
      getSegment: {
        target: getSegment,
        policy: 'privateSegment',
        vary: [getRequestSegmentForVary],
      },
      getProduct: {
        target: getProduct,
        policy: 'productResource',
        serialize: 'value',
        vary: [getSegment],
      },
      getPricing: {
        target: getPricing,
        policy: 'productResource',
        serialize: 'value',
        vary: [getSegment],
      },
      getInventory: {
        target: getInventory,
        policy: 'privateInventory',
        vary: [getSegment],
      },
    },
    components: {
      ProductCard: {
        target: ProductCard,
        policy: 'privateProductCard',
        vary: [getRequestSegmentForVary, getSegment, getProduct, getPricing, getInventory],
      },
    },
  },
});

configureCache(cacheConfig);
