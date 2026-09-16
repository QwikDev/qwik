import { removeQwikCityPlan } from './entries';
import type { Codemod } from './run-codemods';

export { runCodemods } from './run-codemods';

/** Codemods run on the v1 sources, before the packages are renamed. */
export const codemods: Codemod[] = [removeQwikCityPlan];
