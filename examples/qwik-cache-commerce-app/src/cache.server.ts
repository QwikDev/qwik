import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import {
  getInventory,
  getPrice,
  getProduct,
  getRecommendations,
  getShopperSegment,
} from './routes/catalog.server';
import { ProductCard } from './routes/product-card';
import { RecommendationRail } from './routes/recommendation-rail';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-commerce-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-commerce-component',
    },
  },
  optimize: {
    resources: {
      getShopperSegment: {
        target: getShopperSegment,
        policy: 'privateSegment',
      },
      getProduct: {
        target: getProduct,
        policy: 'productResource',
        serialize: 'value',
        vary: [getShopperSegment],
      },
      getPrice: {
        target: getPrice,
        policy: 'productResource',
        serialize: 'value',
        vary: [getShopperSegment],
      },
      getInventory: {
        target: getInventory,
        policy: 'privateInventory',
        vary: [getShopperSegment],
      },
      getRecommendations: {
        target: getRecommendations,
        policy: 'productResource',
        serialize: 'value',
        vary: [getShopperSegment],
      },
    },
    components: {
      ProductCard: {
        target: ProductCard,
        policy: 'privateProductCard',
        vary: [getShopperSegment, getProduct, getPrice, getInventory],
      },
      RecommendationRail: {
        target: RecommendationRail,
        policy: 'privateRecommendationRail',
        vary: [getShopperSegment, getRecommendations],
      },
    },
  },
});

configureCache(cacheConfig);
