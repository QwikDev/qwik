export { createOptimizer } from './optimizer';
export { versions } from './versions';

export type {
  ComponentEntryStrategy,
  Diagnostic,
  DiagnosticCategory,
  EntryStrategy,
  GlobalInjections,
  SegmentAnalysis as HookAnalysis,
  SegmentEntryStrategy as HookEntryStrategy,
  InlineEntryStrategy,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  Path,
  QwikAsset,
  QwikBundle,
  QwikBundleGraph,
  QwikManifest,
  ServerQwikManifest,
  QwikSymbol,
  ResolvedManifest,
  SegmentAnalysis,
  SegmentEntryStrategy,
  SingleEntryStrategy,
  SmartEntryStrategy,
  SourceLocation,
  SourceMapsOption,
  SymbolMapper,
  SymbolMapperFn,
  SystemEnvironment,
  TransformModule,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOptions,
  TransformOutput,
  TranspileOption,
} from './types';

export type { ExperimentalFeatures, QwikBuildMode, QwikBuildTarget } from './plugins/plugin';
export type { QwikRollupPluginOptions } from './plugins/rollup';
export type { QwikVitePlugin, QwikVitePluginApi, QwikVitePluginOptions } from './plugins/vite';

export type { BundleGraphAdder } from './plugins/bundle-graph';

export { qwikRollup } from './plugins/rollup';
export { qwikVite } from './plugins/vite';
/** @alpha @deprecated No longer needed, it is automatic now */
export const symbolMapper = undefined;
