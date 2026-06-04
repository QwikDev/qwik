// Public API surface for qwik-optimizer-ts.
//
// Consumers (e.g. qwik-bundler) import everything they need from here.
// Internal modules under ./optimizer/** remain private — only the names
// re-exported below are part of the package's public contract.

export { transformModule } from './optimizer/transform/index.js';

export { createOptimizer } from './create-optimizer.js';

// Pre-parsed AST input types. Consumers passing a Program from a host
// parser (e.g. Rolldown's `meta.ast`) via `TransformModuleInput.program`
// can type their input against these. The contract is structural — any
// ESTree/TS-ESTree-compatible Program at runtime satisfies the type.
export type {
  AstProgram as Program,
  AstEcmaScriptModule as EcmaScriptModule,
} from './ast-types.js';

export type {
  OptimizerOptions,
  OptimizerSystem,
  Path,
  QwikOptimizer,
  SystemEnvironment,
} from './create-optimizer.js';

export type {
  Diagnostic,
  DiagnosticHighlightFlat,
  EmitMode,
  EntryStrategy,
  MinifyMode,
  SegmentAnalysis,
  TransformModule,
  TransformModuleInput,
  TransformModuleParent,
  TransformModuleSegment,
  TransformModulesOptions,
  TransformOutput,
  WithManualEntryMap,
} from './optimizer/types.js';

export { hasManualEntryMap } from './optimizer/types.js';

// Brand types + smart constructors. Consumers building `TransformModulesOptions`
// or `TransformModuleInput` from raw strings need these to satisfy the type
// system without casting at every call site.
export type {
  BodyText,
  ByteOffset,
  CanonicalFilename,
  ColumnNumber,
  CtxName,
  DisplayName,
  FilePath,
  Hash,
  LineNumber,
  Origin,
  RelativePath,
  SourceText,
  SymbolName,
} from './optimizer/types/brands.js';

export {
  mkBodyText,
  mkByteOffset,
  mkCanonicalFilename,
  mkColumnNumber,
  mkCtxName,
  mkDisplayName,
  mkFilePath,
  mkHash,
  mkLineNumber,
  mkOrigin,
  mkRelativePath,
  mkSourceText,
  mkSymbolName,
} from './optimizer/types/brands.js';
