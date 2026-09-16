import { removeQwikCityPlan, renameQwikCityPlatform, replaceNotFound } from './entries';
import { removeSetupServiceWorker } from './router';
import { renameMaximunStreamingOptions } from './server';
import type { Codemod } from './run-codemods';

export { runCodemods } from './run-codemods';

/** Codemods run on the v1 sources, before the packages are renamed. */
export const codemods: Codemod[] = [
  removeQwikCityPlan,
  replaceNotFound,
  renameQwikCityPlatform,
  removeSetupServiceWorker,
  renameMaximunStreamingOptions,
];
