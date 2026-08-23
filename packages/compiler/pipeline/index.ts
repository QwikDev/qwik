/**
 * The staged compiler pipeline: `analyseModule` → `linkPlans` → per-target generators.
 *
 * See ./DESIGN.md for the full architecture, model rationale, phases, and verification gates. The
 * legacy pipeline in `../src` is the differential oracle until the cutover commit.
 */
export * from './schema';
export { analyseModule, type AnalyseInput, type AnalyseOptions } from './analyse/analyse-module';
export { InvalidModuleError, UnsupportedError } from './errors';
export {
  linkPlans,
  ResolutionKind,
  SideEffects,
  type LinkEntry,
  type PluginSnapshot,
  type ResolverSnapshot,
} from './link/link-plans';
export { generateJsCsr } from './generate/js-csr';
export { generateJsSsr } from './generate/js-ssr';
export { generateRustSsr } from './generate/rust-ssr';
export { type GenerateOutput, type PresentationOptions } from './generate/output';
export { transformModules } from './compat/transform-modules';
