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

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};

declare var __DEFAULT_LOADERS_SERIALIZATION_STRATEGY__: SerializationStrategy;

/** Should routes not have a trailing slash? */
declare var __NO_TRAILING_SLASH__: boolean;

/** Maximum number of SSR-rendered pages to keep in the in-memory cache. */
declare var __SSR_CACHE_SIZE__: number;

/**
 * When true, route loaders and actions use strict mode by default:
 *
 * - Loaders without explicit `search` act as if `search: []` — they only re-fetch on route path
 *   changes and ignore all URL search params.
 * - Actions without explicit `invalidate` act as if `invalidate: []` — they don't re-run any loaders
 *   after completion.
 */
declare var __STRICT_LOADERS__: boolean;

declare var __QWIK_BUILD_DIR__: string;
declare var __QWIK_ASSETS_DIR__: string;
