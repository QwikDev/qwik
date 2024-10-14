/* eslint-disable no-var */
// Globals used by qwik-city, for internal use only

type RequestEventInternal =
  import('./middleware/request-handler/request-event').RequestEventInternal;
type AsyncStore = import('node:async_hooks').AsyncLocalStorage<RequestEventInternal>;

/** @deprecated Remove this in v2 */
declare var QWIK_MANIFEST: import('@builder.io/qwik/optimizer').QwikManifest | undefined | null;

declare var qcAsyncRequestStore: AsyncStore | undefined;
declare var _qwikActionsMap: Map<string, ActionInternal> | undefined;
declare var __qwikCityNew: boolean | undefined;

type ExperimentalFeatures = import('@builder.io/qwik/optimizer').ExperimentalFeatures;

declare var __EXPERIMENTAL__: {
  [K in ExperimentalFeatures]: boolean;
};
