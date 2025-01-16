export { createOptimizer } from './optimizer';
export { versions } from './versions';

export type {
  ComponentEntryStrategy,
  Diagnostic,
  DiagnosticCategory,
  EntryStrategy,
  GlobalInjections,
  SegmentAnalysis as HookAnalysis,
  SegmentAnalysis,
  SegmentEntryStrategy as HookEntryStrategy,
  SegmentEntryStrategy,
  InlineEntryStrategy,
  InsightManifest,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  Path,
  QwikBundle,
  QwikManifest,
  QwikSymbol,
  ResolvedManifest,
  SingleEntryStrategy,
  SmartEntryStrategy,
  SourceLocation,
  SourceMapsOption,
  SymbolMapper,
  SymbolMapperFn,
  SystemEnvironment,
  TransformFsOptions,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOptions,
  TransformOutput,
  TranspileOption,
} from './types';

export type { QwikBuildMode, QwikBuildTarget, ExperimentalFeatures } from './plugins/plugin';
export type { QwikRollupPluginOptions } from './plugins/rollup';
export type {
  QwikViteDevResponse,
  QwikVitePlugin,
  QwikVitePluginApi,
  QwikVitePluginOptions,
} from './plugins/vite';

export { qwikRollup } from './plugins/rollup';
export { qwikVite } from './plugins/vite';
export { symbolMapper } from './plugins/vite-dev-server';
