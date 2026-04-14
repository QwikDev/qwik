/**
 * Shared state type for the parent module rewrite pipeline.
 *
 * Threaded through all rewrite phases to avoid passing 20+ parameters.
 */

import type MagicString from 'magic-string';
import type { ExtractionResult } from '../extract.js';
import type { ImportInfo } from '../marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from '../variable-migration.js';
import type { JsxTransformOutput } from '../transform/jsx.js';
import type { EmitMode } from '../types.js';
import type { AstProgram } from '../../ast-types.js';
import type { InlineStrategyOptions, JsxRewriteOptions } from './index.js';

export interface SurvivingImportInfo {
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
  relPath: string;
  s: MagicString;
  program: AstProgram;
  extractions: ExtractionResult[];
  originalImports: Map<string, ImportInfo>;
  migrationDecisions?: MigrationDecision[];
  moduleLevelDecls?: ModuleLevelDecl[];
  jsxOptions?: JsxRewriteOptions;
  mode?: EmitMode;
  devFilePath?: string;
  inlineOptions?: InlineStrategyOptions;
  stripExports?: string[];
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
}
