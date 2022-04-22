export { createOptimizer } from './optimizer';
export { versions } from './versions';

export type {
  CodeHighlight,
  ComponentEntryStrategy,
  Diagnostic,
  DiagnosticType,
  EntryStrategy,
  GlobalInjections,
  HookAnalysis,
  HookEntryStrategy,
  ManualEntryStrategy,
  MinifyMode,
  Optimizer,
  OptimizerOptions,
  OptimizerSystem,
  SymbolsEntryMap,
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
export type { QwikViteOptions } from './plugins/vite';

export { qwikRollup } from './plugins/rollup';
export { qwikVite } from './plugins/vite';
