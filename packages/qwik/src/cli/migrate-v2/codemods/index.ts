import { moveInternalImports, replaceEventTypes, replaceRemovedJsxTypes } from './core-types';
import { keepV1EventNames } from './events';
import { removeQwikCityPlan, renameQwikCityPlatform, replaceNotFound } from './entries';
import { migrateQwikLabs } from './labs';
import { warnRemovedApis } from './removed-apis';
import { removeSetupServiceWorker } from './router';
import {
  keepV1StreamingDefaults,
  removeRemovedRenderOptions,
  renameMaximunStreamingOptions,
} from './server';
import type { Codemod } from './run-codemods';
import { keepV1TaskCleanupTiming, removeTaskEagerness } from './tasks';
import {
  keepAssetsDir,
  keepBaseOutDir,
  removeDevInput,
  removeStableExperimentalFeatures,
  warnManualChunks,
} from './vite-config';

export { runCodemods } from './run-codemods';

/** Codemods run on the v1 sources, before the packages are renamed. */
export const codemods: Codemod[] = [
  // warn before other codemods rewrite the imports
  warnRemovedApis,
  removeQwikCityPlan,
  replaceNotFound,
  renameQwikCityPlatform,
  removeSetupServiceWorker,
  renameMaximunStreamingOptions,
  removeRemovedRenderOptions,
  keepV1StreamingDefaults,
  removeDevInput,
  removeStableExperimentalFeatures,
  keepBaseOutDir,
  keepAssetsDir,
  warnManualChunks,
  migrateQwikLabs,
  replaceRemovedJsxTypes,
  replaceEventTypes,
  moveInternalImports,
  removeTaskEagerness,
  keepV1TaskCleanupTiming,
  keepV1EventNames,
];
