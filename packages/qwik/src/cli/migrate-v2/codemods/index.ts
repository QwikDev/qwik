import { removeQwikCityPlan, renameQwikCityPlatform, replaceNotFound } from './entries';
import { removeSetupServiceWorker } from './router';
import {
  keepV1StreamingDefaults,
  removeRemovedRenderOptions,
  renameMaximunStreamingOptions,
} from './server';
import type { Codemod } from './run-codemods';
import { removeDevInput, removeStableExperimentalFeatures } from './vite-config';

export { runCodemods } from './run-codemods';

/** Codemods run on the v1 sources, before the packages are renamed. */
export const codemods: Codemod[] = [
  removeQwikCityPlan,
  replaceNotFound,
  renameQwikCityPlatform,
  removeSetupServiceWorker,
  renameMaximunStreamingOptions,
  removeRemovedRenderOptions,
  keepV1StreamingDefaults,
  removeDevInput,
  removeStableExperimentalFeatures,
];
