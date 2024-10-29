/* eslint-disable no-var */
// Globals used by qwik-router, for internal use only

type RequestEventInternal =
  import('./middleware/request-handler/request-event').RequestEventInternal;
type AsyncStore = import('node:async_hooks').AsyncLocalStorage<RequestEventInternal>;

/** @deprecated Remove this in v2 */
declare var QWIK_MANIFEST: import('@qwik.dev/core/optimizer').QwikManifest | undefined | null;

declare var qcAsyncRequestStore: AsyncStore | undefined;
declare var _qwikActionsMap: Map<string, ActionInternal> | undefined;

/** @deprecated Will be removed in v3 */
declare var __qwikCityNew: boolean | undefined;

declare var __qwikRouterNew: boolean | undefined;

type ExperimentalFeatures = import('@qwik.dev/core/optimizer').ExperimentalFeatures;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};
