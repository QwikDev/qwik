import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { getSharedMetric, getStressItem, getStressSegment } from './routes/stress.server';
import { NestedStressPanel, StressCard } from './routes/stress-card';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-torture-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-torture-component',
    },
  },
  optimize: {
    resources: {
      getStressSegment: {
        target: getStressSegment,
        policy: 'privateStressSegment',
      },
      getStressItem: {
        target: getStressItem,
        policy: 'stressResource',
        serialize: 'value',
        vary: [getStressSegment],
      },
      getSharedMetric: {
        target: getSharedMetric,
        policy: 'stressResource',
        serialize: 'value',
        vary: [getStressSegment],
      },
    },
    components: {
      StressCard: {
        target: StressCard,
        policy: 'stressCard',
        vary: [getStressSegment, getStressItem, getSharedMetric],
      },
      NestedStressPanel: {
        target: NestedStressPanel,
        policy: 'stressPanel',
        vary: [getStressSegment, getStressItem, getSharedMetric],
      },
    },
  },
});

configureCache(cacheConfig);
