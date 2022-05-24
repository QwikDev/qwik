export { createOptimizer } from './optimizer';
export { versions } from './versions';

export type {
  ComponentEntryStrategy,
  Diagnostic,
  DiagnosticCategory,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  HookEntryStrategy,
  ManualEntryStrategy,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  QwikManifest,
  QwikBundle,
  QwikSymbol,
  SystemEnvironment,
  Path,
  SingleEntryStrategy,
  SmartEntryStrategy,
  SourceMapsOption,
  SourceLocation,
  TransformFsOptions,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TranspileOption,
  TransformOutput,
} from './types';

export type { QwikRollupPluginOptions } from './plugins/rollup';
export type { QwikVitePluginOptions } from './plugins/vite';

export { qwikRollup } from './plugins/rollup';
export { qwikVite } from './plugins/vite';
