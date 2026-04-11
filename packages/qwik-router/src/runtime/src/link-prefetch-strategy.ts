import type { LinkDataCoarsePrefetchStrategy, LinkDataFinePrefetchStrategy } from './types';

export const DEFAULT_LINK_DATA_PREFETCH_STRATEGY = {
  coarsePointer: ['viewport'] satisfies LinkDataCoarsePrefetchStrategy[],
  finePointer: ['hover'] satisfies LinkDataFinePrefetchStrategy[],
};
