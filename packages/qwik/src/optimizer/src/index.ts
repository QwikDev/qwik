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
  SymbolMapper,
  SymbolMapperFn,
  InlineEntryStrategy,
  TransformOptions,
} from './types';

export type { QwikRollupPluginOptions } from './plugins/rollup';
export type {
  QwikVitePluginOptions,
  QwikVitePluginApi,
  QwikVitePlugin,
  QwikViteDevResponse,
} from './plugins/vite';
export type { QwikBuildMode, QwikBuildTarget } from './plugins/plugin';

export { qwikRollup } from './plugins/rollup';
export { qwikVite } from './plugins/vite';
