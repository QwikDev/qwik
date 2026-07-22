// Public API surface for qwik-ts-optimizer.
//
// Only the names re-exported below are part of the package's public contract;
// modules under ./optimizer/** remain internal.

export { transformModule } from './optimizer/transform/index.js';

export { createOptimizer } from './create-optimizer.js';

// Pre-parsed AST input types. The contract is structural — any
// ESTree/TS-ESTree-compatible Program satisfies the type at runtime.
export type {
  AstProgram as Program,
  AstEcmaScriptModule as EcmaScriptModule,
} from './ast-types.js';

export type {
  NapiDiagnostic,
  NapiSegmentAnalysis,
  NapiSourceLocation,
  NapiTransformModule,
  NapiTransformModuleInput,
  NapiTransformModulesOptions,
  NapiTransformOutput,
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
} from './optimizer/types/types.js';

export { hasManualEntryMap } from './optimizer/types/types.js';

// Brand types + smart constructors — consumers building options from raw strings
// need these to satisfy the type system without casting at every call site.
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
