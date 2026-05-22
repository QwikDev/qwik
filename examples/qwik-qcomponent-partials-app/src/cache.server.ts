import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { PricingBadge } from './routes/pricing-badge';
import { ProductCard } from './routes/product-card';
import { getPricing, getProduct, getSegment } from './routes/products.server';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-qcomponent-partials-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-qcomponent-partials-component',
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
      ProductCard: {
        target: ProductCard,
        policy: 'privateProductCard',
        vary: [getSegment, getProduct],
      },
      PricingBadge: {
        target: PricingBadge,
        policy: 'privatePricingBadge',
        vary: [getSegment, getPricing],
      },
    },
  },
});

configureCache(cacheConfig);
