/* eslint-disable no-var */
// Globals used by qwik-router, for internal use only

declare module '*?compiled-string' {
  const str: string;
  export default str;
}

type RequestEventInternal =
  import('./middleware/request-handler/request-event').RequestEventInternal;
type SerializationStrategy = import('@qwik.dev/core/internal').SerializationStrategy;
declare var _qwikActionsMap: Map<string, ActionInternal> | undefined;

type ExperimentalFeatures = import('@qwik.dev/core/optimizer').ExperimentalFeatures;

type LinkDataPrefetchOptions = import('./src/runtime/src/types').LinkDataPrefetchOptions;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};

declare var __DEFAULT_LOADERS_SERIALIZATION_STRATEGY__: SerializationStrategy;

/** Should routes not have a trailing slash? */
declare var __NO_TRAILING_SLASH__: boolean;

/** Specifies when link resources should be prefetched to improve navigation performance. */
declare var __LINK_DATA_PREFETCH_STRATEGY__: LinkDataPrefetchOptions;

/** Maximum number of SSR-rendered pages to keep in the in-memory cache. */
declare var __SSR_CACHE_SIZE__: number;

declare var __QWIK_BUILD_DIR__: string;
declare var __QWIK_ASSETS_DIR__: string;
