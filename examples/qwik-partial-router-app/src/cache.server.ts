import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { AccountPagePartial, ProductPagePartial, SearchPagePartial } from './routes/partials';
import {
  getAccountPage,
  getProductPage,
  getRouteSegment,
  getSearchPage,
} from './routes/partials.server';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-partial-router-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-partial-router-component',
    },
  },
  optimize: {
    resources: {
      getRouteSegment: {
        target: getRouteSegment,
        policy: 'privateRouteSegment',
      },
      getProductPage: {
        target: getProductPage,
        policy: 'privateRouteResource',
        serialize: 'value',
        vary: [getRouteSegment],
      },
      getAccountPage: {
        target: getAccountPage,
        policy: 'privateRouteResource',
        serialize: 'value',
        vary: [getRouteSegment],
      },
      getSearchPage: {
        target: getSearchPage,
        policy: 'privateRouteResource',
        serialize: 'value',
        vary: [getRouteSegment],
      },
    },
    components: {
      ProductPagePartial: {
        target: ProductPagePartial,
        policy: 'privatePartial',
        vary: [getRouteSegment, getProductPage],
      },
      AccountPagePartial: {
        target: AccountPagePartial,
        policy: 'privatePartial',
        vary: [getRouteSegment, getAccountPage],
      },
      SearchPagePartial: {
        target: SearchPagePartial,
        policy: 'privatePartial',
        vary: [getRouteSegment, getSearchPage],
      },
    },
  },
});

configureCache(cacheConfig);
