import { moveInternalImports, replaceEventTypes, replaceRemovedJsxTypes } from './core-types';
import { keepV1EventNames } from './events';
import { removeQwikCityPlan, renameQwikCityPlatform, replaceNotFound } from './entries';
import { removeSlotChildren, renameHtmlFor } from './jsx';
import { migrateQwikLabs } from './labs';
import { warnRemovedApis } from './removed-apis';
import {
  keepV1HeadOrder,
  keepV1LinkPrefetch,
  keepV1ViewTransitions,
  removeSetupServiceWorker,
} from './router';
import { keepV1LoaderInvalidation, keepV1RequestBodyLimit } from './router-config';
import {
  keepV1StreamingDefaults,
  removeRemovedRenderOptions,
  renameMaximunStreamingOptions,
} from './server';
import type { Codemod, ProjectCodemod } from './run-codemods';
import { addNavigationProbeLoaders, renameV2ErrorBoundaryFiles } from './route-files';
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
  renameHtmlFor,
  removeSlotChildren,
  keepV1LoaderInvalidation,
  keepV1RequestBodyLimit,
  keepV1ViewTransitions,
  keepV1HeadOrder,
  keepV1LinkPrefetch,
];

/** Codemods run on the whole project before the file codemods. */
export const projectCodemods: ProjectCodemod[] = [
  renameV2ErrorBoundaryFiles,
  addNavigationProbeLoaders,
];
