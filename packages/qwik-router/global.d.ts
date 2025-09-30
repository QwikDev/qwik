/* eslint-disable no-var */
// Globals used by qwik-router, for internal use only

type RequestEventInternal =
  import('./middleware/request-handler/request-event').RequestEventInternal;
type AsyncStore = import('node:async_hooks').AsyncLocalStorage<RequestEventInternal>;
type SerializationStrategy = import('@qwik.dev/core/internal').SerializationStrategy;
declare var qcAsyncRequestStore: AsyncStore | undefined;
declare var _qwikActionsMap: Map<string, ActionInternal> | undefined;

type ExperimentalFeatures = import('@qwik.dev/core/optimizer').ExperimentalFeatures;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};

declare var __DEFAULT_LOADERS_SERIALIZATION_STRATEGY__: SerializationStrategy;

/** Should routes not have a trailing slash? */
declare var __NO_TRAILING_SLASH__: boolean;

declare var __QWIK_BUILD_DIR__: string;
declare var __QWIK_ASSETS_DIR__: string;
