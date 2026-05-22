import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { ProductPagePartial } from './routes/product-page-partial';
import { getPricing, getProduct, getSegment } from './routes/products.server';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-partial-navigation-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-partial-navigation-component',
    },
  },

  optimize: {
    resources: {
      getSegment: {
        target: getSegment,
        policy: 'privateSegment',
      },
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
      ProductPagePartial: {
        target: ProductPagePartial,
        policy: 'privateProductPage',
        vary: [getSegment, getProduct, getPricing],
      },
    },
  },
});

configureCache(cacheConfig);
