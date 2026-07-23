import type MagicString from 'magic-string';
import type { ExtractionResult } from '../extraction/extract.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from '../analysis/variable-migration.js';
import type { JsxTransformOutput } from '../jsx/jsx.js';
import type { EmitMode } from '../types/types.js';
import type { AstFunction, AstProgram } from '../../ast-types.js';
import type { RelativePath } from '../types/brands.js';
import type { InlineStrategyOptions, JsxRewriteOptions } from './index.js';

interface SurvivingImportInfo {
  defaultPart: string;
  nsPart: string;
  namedParts: { local: string; imported: string }[];
  quote: string;
  source: string;
  isSideEffect: boolean;
  preservedAll: boolean;
}

export interface RewriteContext {
  source: string;
  relPath: RelativePath;
  s: MagicString;
  program: AstProgram;
  closureNodes?: Map<string, AstFunction>;
  extractions: ExtractionResult[];
  originalImports: Map<string, ImportInfo>;
  migrationDecisions?: MigrationDecision[];
  moduleLevelDecls?: ModuleLevelDecl[];
  jsxOptions?: JsxRewriteOptions;
  mode?: EmitMode;
  devFilePath?: string;
  userDevPath?: string;
  inlineOptions?: InlineStrategyOptions;
  stripExports?: readonly string[];
  isServer?: boolean;
  explicitExtensions?: boolean;
  transpileTs?: boolean;
  minify?: string;
  outputExtension?: string;

  // Accumulated state across phases
  extractedCalleeNames: Set<string>;
  alreadyImported: Set<string>;
  survivingUserImports: string[];
  survivingImportInfos: SurvivingImportInfo[];
  topLevel: ExtractionResult[];
  earlyQrlVarNames: Map<string, string>;
  neededImports: Map<string, string>;
  qrlVarNames: Map<string, string>;
  qrlDecls: string[];
  sCalls: string[];
  inlineHoistedDeclarations: string[];
  inlinedQrlSymbols: Set<string>;
  eventHandlerExtraImports: Array<{ sym: string; src: string }>;
  noArgQrlCallees: Array<{ callee: string; source: string }>;
  jsxResult: JsxTransformOutput | null;
  jsxKeyCounterValue: number;
  isDevMode: boolean;
  isInline: boolean;
  isLibMode: boolean;
  hasForeignJsxRuntime: boolean;
}
