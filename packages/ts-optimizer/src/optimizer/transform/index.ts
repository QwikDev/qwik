/**
 * Public entry point for the Qwik optimizer. `transformModule` accepts `TransformModulesOptions`
 * and returns `TransformOutput`, sequencing extraction, capture analysis, variable migration,
 * parent rewriting, and segment codegen behind one public API.
 */

import type {
  AstEcmaScriptModule,
  AstFunction,
  AstProgram,
  TSEnumDeclaration,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import { flattenAndReparse } from '../prepare/flatten-destructures.js';
import { detectForeignJsxRuntime } from '../jsx/jsx-import-source.js';
import type { ConsolidatedSegment, ExtractionResult, Mutable } from '../extraction/extract.js';
import { repairInput } from '../prepare/input-repair.js';
import {
  rewriteParentModule,
  resolveConstLiteralsInClosure,
  type InlineStrategyOptions,
  type JsxRewriteOptions,
  type ParentRewriteResult,
} from '../rewrite/index.js';
import {
  collectImports,
  sourceMayContainMarkers,
  type ImportInfo,
} from '../extraction/marker-detection.js';
import { buildDevFilePath } from '../segment/dev-mode.js';
import { isSimpleIdentifierName } from '../ast/identifier-name.js';
import { type SymbolName, mkSymbolName, type RelativePath } from '../types/brands.js';
import {
  analyzeCaptures,
  collectScopeIdentifiers,
  excludeNestedExtractionCaptures,
} from '../analysis/capture-analysis.js';
import {
  gatherModuleFacts,
  type ModuleGatherFacts,
  type PassiveConflict,
} from '../analysis/module-gather-walk.js';
import type { ScopeAwareCollectResult } from '../jsx/jsx.js';
import {
  analyzeMigration,
  collectModuleLevelDecls,
  filterInlineStrategyMigrations,
  type MigrationDecision,
  type ModuleLevelDecl,
} from '../analysis/variable-migration.js';
import type {
  Diagnostic,
  EmitMode,
  EntryStrategy,
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
  TransformModule,
} from '../types/types.js';
import {
  classifyDeclarationType,
  classifyDeclarationTypeInClosure,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from '../diagnostics/diagnostics.js';
import {
  computeOutputExtension,
  computeParentModulePath,
  computeRelPath,
  getExtension,
} from '../../paths.js';
import {
  buildParentExtractionMap,
  buildPassthroughModule,
  removeUnusedImports,
} from './module-cleanup.js';
import { applySegmentDCE } from './dead-code.js';
import {
  detectC02Diagnostics,
  detectC05Diagnostics,
  emitPassiveConflictDiagnostics,
} from '../diagnostics/diagnostic-detection.js';
import {
  leadingSquareBracket,
  trailingSquareBracket,
  paddingParam,
} from '../segment/post-process.js';
import {
  promoteEventHandlerCaptures,
  unifyParameterSlots,
  buildElementCaptureMap,
  type EventCaptureContext,
} from '../jsx/event-capture-promotion.js';
import type { LoopContext } from '../jsx/loop-hoisting.js';
import {
  generateAllSegmentModules,
  type SegmentGenerationContext,
} from '../segment/segment-generation.js';

/**
 * Output-level source-kind flags accumulated across input files. The accumulation is
 * order-sensitive: a file sees `isJsx: true` if any earlier input (or itself) was JSX.
 */
interface ModuleKindFlags {
  readonly isTypeScript: boolean;
  readonly isJsx: boolean;
}

/** Per-input invariants shared by every phase helper. */
interface ModuleContext {
  readonly input: TransformModuleInput;
  readonly options: TransformModulesOptions;
  readonly relPath: RelativePath;
  readonly ext: string;
}

/** Phase 0 + 0.5 result: repaired/flattened source and its single parse. */
interface PreparedModuleInput {
  readonly repairedCode: string;
  readonly program: AstProgram;
  readonly parserModule: AstEcmaScriptModule | undefined;
  readonly hasForeignJsxRuntime: boolean;
  readonly foreignJsxPragmaText: string | null;
}

/**
 * Phase 1+2 walk result: the extraction set plus every gathered per-module fact, all from the
 * single fused program traversal.
 */
interface ExtractedModule {
  readonly kind: 'extracted';
  readonly extractions: ExtractionResult[];
  readonly closureNodes: Map<string, AstFunction>;
  readonly facts: ModuleGatherFacts;
}

/**
 * Phase 1 result. `passthrough` is the early exit for inputs with no marker calls and no JSX to
 * transpile — the module is emitted verbatim.
 */
type SegmentExtraction =
  | { readonly kind: 'passthrough'; readonly module: TransformModule }
  | ExtractedModule;

/** Emit configuration derived purely from options + input extension. */
interface EmitConfig {
  readonly emitMode: EmitMode;
  readonly entryStrategy: EntryStrategy;
  readonly isInlineStrategy: boolean;
  readonly isLibMode: boolean;
  readonly shouldTranspileJsx: boolean;
  readonly shouldTranspileTs: boolean;
  readonly qrlOutputExt: string;
  readonly parentModulePath: string;
}

/**
 * Phase 2 result. Capture analysis also mutates `extractions` in place
 * (captureNames/paramNames/captures and the `'captured'` phase flip). The usage maps and
 * passive-conflict list arrive pre-built from the Phase-1 gather walk; `scopeAwareBindings` is
 * present only when this module will run the Phase-4 JSX transform.
 */
interface CaptureAnalysis {
  readonly originalImports: Map<string, ImportInfo>;
  readonly importedNames: Set<string>;
  readonly enclosingExtMap: Map<string, ExtractionResult>;
  readonly extractionLoopMap: Map<string, LoopContext[]>;
  readonly elementQpParamsMap: Map<string, string[]>;
  readonly segmentUsage: Map<string, Set<string>>;
  readonly rootUsage: Set<string>;
  readonly passiveConflicts: readonly PassiveConflict[];
  readonly scopeAwareBindings: ScopeAwareCollectResult | undefined;
}

/** Phase 3 result: module-level decl inventory + migration decisions. */
interface MigrationAnalysis {
  readonly moduleLevelDecls: ModuleLevelDecl[];
  readonly moduleLevelDeclsByName: Map<string, ModuleLevelDecl>;
  readonly segmentUsage: Map<string, Set<string>>;
  readonly migrationDecisions: MigrationDecision[];
}

/** Phase 4 result: the rewritten parent module + rewrite byproducts. */
interface ParentRewrite {
  readonly parentModule: TransformModule;
  readonly parentResult: ParentRewriteResult;
  readonly devFile: string | undefined;
}

/** Everything one input file contributes to the final TransformOutput. */
interface ModuleTransformResult {
  readonly modules: readonly TransformModule[];
  readonly diagnostics: readonly Diagnostic[];
  readonly flags: ModuleKindFlags;
}

/**
 * Transform Qwik source modules by extracting segments, rewriting the parent module, and generating
 * segment module code. Public API consumed by the Qwik Vite plugin.
 *
 * Pipeline per input file (see `transformOneModule`): repair -> extract -> analyze captures ->
 * migrate -> rewrite parent -> generate segments
 */
export function transformModule(options: TransformModulesOptions): TransformOutput {
  const allModules: TransformModule[] = [];
  const diagnostics: Diagnostic[] = [];
  let flags: ModuleKindFlags = { isTypeScript: false, isJsx: false };

  for (const input of options.input) {
    const result = transformOneModule(input, options, flags);
    allModules.push(...result.modules);
    diagnostics.push(...result.diagnostics);
    flags = result.flags;
  }

  return {
    modules: allModules,
    diagnostics: applyDiagnosticSuppression(diagnostics, options.input),
    isTypeScript: flags.isTypeScript,
    isJsx: flags.isJsx,
  };
}

/**
 * Run the full per-file pipeline for one input module. Phase 6 (diagnostic suppression) is
 * cross-file and runs once in `transformModule`, not here.
 */
function transformOneModule(
  input: TransformModuleInput,
  options: TransformModulesOptions,
  priorFlags: ModuleKindFlags
): ModuleTransformResult {
  const relPath = computeRelPath(input.path, options.srcDir);
  const ext = getExtension(relPath);
  const flags: ModuleKindFlags = {
    isTypeScript: priorFlags.isTypeScript || ext === '.ts' || ext === '.tsx',
    isJsx: priorFlags.isJsx || ext === '.tsx' || ext === '.jsx',
  };
  const mod: ModuleContext = { input, options, relPath, ext };
  const diagnostics: Diagnostic[] = [];

  const prepared = prepareModuleInput(mod);
  const extracted = extractModuleSegments(mod, prepared);
  if (extracted.kind === 'passthrough') {
    return { modules: [extracted.module], diagnostics, flags };
  }
  const { extractions, closureNodes } = extracted;

  const emit = resolveEmitConfig(mod);
  const analysis = analyzeModuleCaptures(mod, prepared, extracted, emit.entryStrategy, diagnostics);
  const migration = attributeSegmentUsage(
    mod,
    prepared,
    extractions,
    analysis,
    emit.isInlineStrategy
  );
  const preRenameSymbolName = applyProdRename(extractions, closureNodes, emit.emitMode);
  const sourceExtensions = downgradeExtensions(
    extractions,
    emit.shouldTranspileJsx,
    emit.shouldTranspileTs
  );
  const parent = rewriteParent(
    mod,
    prepared,
    extractions,
    closureNodes,
    analysis,
    migration,
    emit,
    diagnostics
  );
  const segmentModules = generateSegments(
    mod,
    prepared,
    parent,
    extractions,
    closureNodes,
    analysis,
    migration,
    emit,
    preRenameSymbolName,
    sourceExtensions,
    flags.isJsx
  );

  return {
    modules: [parent.parentModule, ...segmentModules],
    diagnostics,
    flags,
  };
}

/** Phase 0 + 0.5: repair, flatten, parse once, detect foreign JSX runtime. */
function prepareModuleInput(mod: ModuleContext): PreparedModuleInput {
  const { input, relPath } = mod;

  // Phase 0: repair recoverable parse errors. A caller-supplied pre-parsed
  // Program (typically a bundler's `meta.ast`) is used directly, skipping the
  // internal parse.
  const repairResult = repairInput(input.code, relPath, input.program, input.module);
  let repairedCode = repairResult.source;
  // Reuse repair's program when present; otherwise parse once here so
  // extraction doesn't re-parse the same source.
  let program: AstProgram;
  let parserModule: AstEcmaScriptModule | undefined;
  if (repairResult.program) {
    program = repairResult.program;
    parserModule = repairResult.module;
  } else {
    const parsed = parseWithRawTransfer(relPath, repairedCode);
    program = parsed.program;
    parserModule = parsed.module;
  }

  // Phase 0.5: flatten `const {x} = useFoo()` inside `component$` bodies to
  // `const foo = useFoo()` + reference rewrites (a pre-extraction code-size
  // optimization). Re-parse when it changes so downstream phases see the
  // rewritten source.
  const flattened = flattenAndReparse(repairedCode, relPath, program);
  if (flattened.changed) {
    repairedCode = flattened.source;
    program = flattened.program;
    parserModule = flattened.module ?? parserModule;
  }

  // Detect a foreign `@jsxImportSource` pragma once; threaded into rewrite +
  // segment generation so both skip Qwik's JSX rewrite and defer to
  // oxc-transform's default JSX handling for the pragma's runtime.
  const { hasForeignJsxRuntime, pragmaText: foreignJsxPragmaText } =
    detectForeignJsxRuntime(repairedCode);

  return {
    repairedCode,
    program,
    parserModule,
    hasForeignJsxRuntime,
    foreignJsxPragmaText,
  };
}

/**
 * Drop `inlinedQrl` extractions nested as a value inside another `inlinedQrl`'s captures array. A
 * QRL used as a capture value is not a lazy boundary; extracting it would rewrite its call site
 * inside the outer `.w([...])` and collide with the outer capture-wrap edit. Containment is read
 * off offsets: a call inside another inlinedQrl but after its arg0 (`callStart >= argEnd`) can only
 * sit in the captures array.
 */
function filterCaptureInlinedQrls(extractions: ExtractionResult[]): ExtractionResult[] {
  const inlined = extractions.filter((e) => e.isInlinedQrl);
  if (inlined.length < 2) return extractions;

  const captureInlined = new Set<ExtractionResult>();
  for (const inner of inlined) {
    for (const outer of inlined) {
      if (inner === outer) continue;
      if (
        inner.callStart > outer.callStart &&
        inner.callEnd < outer.callEnd &&
        inner.callStart >= outer.argEnd
      ) {
        captureInlined.add(inner);
        break;
      }
    }
  }

  if (captureInlined.size === 0) return extractions;
  return extractions.filter((e) => !captureInlined.has(e));
}

function extractModuleSegments(
  mod: ModuleContext,
  prepared: PreparedModuleInput
): SegmentExtraction {
  const { input, options, relPath, ext } = mod;
  const { repairedCode, program, parserModule } = prepared;

  const willTranspileJsx = options.transpileJsx !== false && (ext === '.tsx' || ext === '.jsx');

  // Sound prefilter: a module whose text cannot contain an extraction trigger
  // (see `sourceMayContainMarkers`) and has no JSX to transpile is a
  // passthrough — skipping the gather walk here cannot change behavior.
  if (!willTranspileJsx && !sourceMayContainMarkers(repairedCode)) {
    return {
      kind: 'passthrough',
      module: buildPassthroughModule(repairedCode, relPath, input.path, program),
    };
  }

  // Closure AST nodes are threaded out keyed by post-disambiguation
  // symbolName, so downstream phases reuse the original parse instead of
  // re-parsing each extraction's body.
  const closureNodes = new Map<string, AstFunction>();
  // One fused traversal produces the extraction set and every per-module fact.
  // Identity-dependent projections key off closures discovered mid-walk;
  // symbolName-keyed maps are derived post-walk, after disambiguation.
  const facts = gatherModuleFacts({
    program,
    repairedCode,
    scopeEntries: true,
    passiveConflicts: true,
    // Gather scope bindings only when the Phase-4 JSX transform will consume
    // them (same `willTranspileJsx` gate `rewriteParent` uses).
    scopeBindings: willTranspileJsx,
    extraction: {
      source: repairedCode,
      relPath,
      scope: options.scope,
      transpileJsx: willTranspileJsx,
      // Explicit user-set flag (defaults false) for the ctxKind classifier —
      // distinct from `willTranspileJsx`, which defaults true on .tsx/.jsx.
      explicitTranspileJsx: options.transpileJsx === true,
      parserModule,
      closureNodesOut: closureNodes,
    },
  });
  // The collector's `readonly ExtractedSegment[]` is widened once here; the
  // orchestrator then advances elements in place through the `captured` →
  // `consolidated` phases via per-mutation `Mutable` casts.
  const extractions = facts.extractions as ExtractionResult[];

  if (extractions.length === 0 && !willTranspileJsx) {
    return {
      kind: 'passthrough',
      module: buildPassthroughModule(repairedCode, relPath, input.path, program),
    };
  }

  return {
    kind: 'extracted',
    extractions: filterCaptureInlinedQrls(extractions),
    closureNodes,
    facts,
  };
}

/** Resolve the emit configuration (pure derivation from options + ext). */
function resolveEmitConfig(mod: ModuleContext): EmitConfig {
  const { options, relPath, ext } = mod;

  // `mode: 'lib'` emits a single-module library output: it reuses the inline
  // pipeline, and a post-pass in `output-assembly.ts` collapses the inline
  // shape into `inlinedQrl(body, name, [caps])`.
  let entryStrategy: EntryStrategy;
  if (options.mode === 'lib') {
    entryStrategy = { type: 'inline' as const };
  } else {
    entryStrategy = options.entryStrategy ?? { type: 'smart' as const };
  }

  return {
    emitMode: options.mode ?? 'prod',
    entryStrategy,
    isInlineStrategy: entryStrategy.type === 'inline' || entryStrategy.type === 'hoist',
    isLibMode: options.mode === 'lib',
    shouldTranspileJsx: options.transpileJsx !== false,
    shouldTranspileTs: options.transpileTs === true,
    qrlOutputExt: computeOutputExtension(ext, options.transpileTs, options.transpileJsx),
    parentModulePath: computeParentModulePath(relPath, options.explicitExtensions),
  };
}

/**
 * Phase 2: collect imports and analyze captures.
 *
 * Populates `captureNames` / `paramNames` / `captures` on every extraction (in place), runs
 * event-handler capture-to-param promotion, emits C02 diagnostics, and flips the extraction phase
 * discriminator to `'captured'`.
 */
function analyzeModuleCaptures(
  mod: ModuleContext,
  prepared: PreparedModuleInput,
  extracted: ExtractedModule,
  entryStrategy: EntryStrategy,
  diagnostics: Diagnostic[]
): CaptureAnalysis {
  const { options, relPath } = mod;
  const { repairedCode, program } = prepared;
  const { extractions, closureNodes } = extracted;

  const originalImports = collectImports(program, prepared.parserModule);
  const importedNames = new Set<string>(originalImports.keys());

  const enclosingExtMap = buildParentExtractionMap(extractions);

  const emitsChildFiles = entryStrategy.type !== 'inline' && entryStrategy.type !== 'hoist';
  const childRangesByParent = new Map<string, Array<readonly [number, number]>>();
  if (emitsChildFiles) {
    for (const child of extractions) {
      const parent = enclosingExtMap.get(child.symbolName);
      if (!parent) continue;
      const ranges = childRangesByParent.get(parent.symbolName) ?? [];
      ranges.push([child.argStart, child.argEnd]);
      childRangesByParent.set(parent.symbolName, ranges);
    }
  }

  const moduleScopeIds = collectScopeIdentifiers(program, repairedCode, relPath);

  // Collect each segment body's scope identifiers for nested capture analysis;
  // the closure nodes were already threaded through, so no body re-parse.
  const bodyScopeIds = new Map<string, Set<string>>();
  for (const [symbolName, closureNode] of closureNodes) {
    const bodyIds = collectScopeIdentifiers(closureNode, '', '');
    bodyScopeIds.set(symbolName, bodyIds);
  }

  // Facts from the fused gather walk; node-identity keys (free identifiers,
  // lexical scopes) survive the prod `s_<hash>` rename.
  const {
    closureFreeIdentifiers,
    closureLexicalScopes,
    extractionLoopMap,
    loopBodyVarDecls,
    allScopeEntries,
    segmentUsage,
    rootUsage,
    passiveConflicts,
    scopeAwareBindings,
  } = extracted.facts;

  for (const extraction of extractions) {
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;

    const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;

    const lexicalScope = closureLexicalScopes.get(closureNode);
    const parentScopeIds: Set<string> = lexicalScope ?? moduleScopeIds;

    // inlinedQrl carries explicit captures — read them rather than analyzing.
    if (extraction.isInlinedQrl) {
      if (extraction.explicitCaptures) {
        const items = extraction.explicitCaptures
          .replace(leadingSquareBracket, '')
          .replace(trailingSquareBracket, '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const identCaptures = items.filter(
          (s) =>
            isSimpleIdentifierName(s) &&
            s !== 'true' &&
            s !== 'false' &&
            s !== 'null' &&
            s !== 'undefined'
        );
        extraction.captureNames = identCaptures;
        extraction.captures = identCaptures.length > 0;
      }
      continue;
    }

    const result = analyzeCaptures(
      closureNode,
      parentScopeIds,
      closureFreeIdentifiers.get(closureNode) ?? []
    );
    extraction.captureNames = result.captureNames;
    extraction.paramNames = result.paramNames;
    extraction.captures = result.captures;

    // Function/class declarations aren't serialized captures — keep only vars.
    if (extraction.captureNames.length > 0) {
      const enclosingClosure = enclosingExt ? closureNodes.get(enclosingExt.symbolName) : undefined;
      extraction.captureNames = extraction.captureNames.filter((name) => {
        const declType = enclosingClosure
          ? classifyDeclarationTypeInClosure(enclosingClosure, name)
          : classifyDeclarationType(program, name);
        return declType === 'var';
      });
      extraction.captures = extraction.captureNames.length > 0;
    }

    const childRanges = childRangesByParent.get(extraction.symbolName);
    if (childRanges && extraction.captureNames.length > 0) {
      extraction.captureNames = excludeNestedExtractionCaptures(
        closureNode,
        extraction.captureNames,
        childRanges,
        moduleScopeIds
      );
      extraction.captures = extraction.captureNames.length > 0;
    }

    if (extraction.captures && extraction.paramNames.length > 0) {
      const paramSet = new Set(extraction.paramNames);
      const allCapturesInParams = extraction.captureNames.every((name) => paramSet.has(name));
      if (allCapturesInParams) {
        extraction.captures = false;
      }
    }
  }

  // Resolve const literals for event handlers before capture-to-param promotion
  for (const extraction of extractions) {
    if (extraction.ctxKind !== 'eventHandler') continue;
    if (extraction.isInlinedQrl || extraction.captureNames.length === 0) continue;
    const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;
    if (!enclosingExt) continue;
    const enclosingClosure = closureNodes.get(enclosingExt.symbolName);
    if (!enclosingClosure) continue;
    const constValues = resolveConstLiteralsInClosure(
      enclosingClosure,
      repairedCode,
      extraction.captureNames
    );
    if (constValues.size > 0) {
      extraction.constLiterals = constValues;
      extraction.captureNames = extraction.captureNames.filter((n) => !constValues.has(n));
      extraction.captures = extraction.captureNames.length > 0;
    }
  }

  const globalDeclPositions = new Map<string, number>();
  // Only `inline` (not `hoist`) skips captures→paramNames promotion: `hoist`
  // still needs the `(_, _1, capture)` param-padding form, while `inline`
  // keeps captures in `captureNames` for the `_captures[N]` unpacking path.
  const isInlineOnlyStrategy = entryStrategy.type === 'inline';
  const eventCaptureCtx: EventCaptureContext = {
    extractions,
    closureNodes,
    closureFreeIdentifiers,
    bodyScopeIds,
    moduleScopeIds,
    importedNames,
    enclosingExtMap,
    extractionLoopMap,
    allScopeEntries,
    loopBodyVarDecls,
    repairedCode,
    isInlineStrategy: isInlineOnlyStrategy,
  };

  promoteEventHandlerCaptures(eventCaptureCtx, globalDeclPositions);

  unifyParameterSlots(eventCaptureCtx, globalDeclPositions);

  // Threads strip-config so stripped event handlers' captures still populate
  // `elementQpParamsMap` for segment-body JSX.
  const elementQpParamsMap = buildElementCaptureMap(
    eventCaptureCtx,
    globalDeclPositions,
    options.stripCtxName,
    options.stripEventHandlers
  );

  detectC02Diagnostics(
    extractions,
    closureNodes,
    closureFreeIdentifiers,
    enclosingExtMap,
    importedNames,
    program,
    repairedCode,
    relPath,
    diagnostics
  );

  // Flip the phase discriminator to 'captured' now that captureNames /
  // paramNames are populated. Internal-builder cast avoids a pass-through map.
  for (const extraction of extractions) {
    (extraction as Mutable<ExtractionResult>).phase = 'captured';
  }

  return {
    originalImports,
    importedNames,
    enclosingExtMap,
    extractionLoopMap,
    elementQpParamsMap,
    segmentUsage,
    rootUsage,
    passiveConflicts,
    scopeAwareBindings,
  };
}

/**
 * Under inline/hoist, bodies stay at module level so a top-level extraction's module-scope refs
 * resolve in place — drop them from captures to keep non-serializable module singletons out of
 * `_captures`. Nested extractions (function-local captures) are left untouched.
 */
function dropTopLevelModuleScopeCaptures(
  extractions: ExtractionResult[],
  moduleLevelDeclsByName: ReadonlyMap<string, ModuleLevelDecl>
): void {
  for (const ext of extractions) {
    if (ext.parent !== null || ext.captureNames.length === 0) continue;
    const kept = ext.captureNames.filter((name) => !moduleLevelDeclsByName.has(name));
    if (kept.length === ext.captureNames.length) continue;
    const mut = ext as Mutable<ExtractionResult>;
    mut.captureNames = kept;
    mut.captures = kept.length > 0;
  }
}

/** Phase 3: attribute module-level decl usage and decide migrations. */
function attributeSegmentUsage(
  mod: ModuleContext,
  prepared: PreparedModuleInput,
  extractions: ExtractionResult[],
  analysis: CaptureAnalysis,
  isInlineStrategy: boolean
): MigrationAnalysis {
  const { options } = mod;
  const { repairedCode, program } = prepared;
  const { enclosingExtMap } = analysis;

  const moduleLevelDecls = collectModuleLevelDecls(program, repairedCode);
  const moduleLevelDeclsByName = new Map<string, ModuleLevelDecl>();
  for (const d of moduleLevelDecls) {
    moduleLevelDeclsByName.set(d.name, d);
  }
  // Module-level refs inside an `inlinedQrl` body still need migration
  // attribution: explicit captures cover only closure variables, so
  // body-referenced module decls arrive via the Phase-2 usage maps, not
  // captures.
  const { segmentUsage, rootUsage } = analysis;

  // Augment segmentUsage with a `$()` body's captured names. inlinedQrl
  // captures arrive via `_captures`, not an import — folding them in would
  // wrongly mark them dual-use and reexport them.
  for (const ext of extractions) {
    if (ext.isInlinedQrl) continue;
    const usage = segmentUsage.get(ext.symbolName);
    if (usage && ext.captureNames) {
      for (const name of ext.captureNames) {
        usage.add(name);
      }
    }
  }

  // Captures delivered via q:p (paramNames slots >= 2) are referenced by the parent.
  for (const ext of extractions) {
    if (ext.ctxKind !== 'eventHandler') continue;
    if (ext.paramNames.length < 3 || ext.paramNames[0] !== '_' || ext.paramNames[1] !== '_1')
      continue;
    const parentExt = enclosingExtMap.get(ext.symbolName) ?? null;
    if (!parentExt) continue;
    const parentUsage = segmentUsage.get(parentExt.symbolName);
    if (!parentUsage) continue;
    for (let i = 2; i < ext.paramNames.length; i++) {
      const p = ext.paramNames[i];
      if (paddingParam.test(p)) continue;
      parentUsage.add(p);
    }
  }

  // With transpileTs, TS enum values are inlined into segment bodies, so their
  // names shouldn't count as segment usage.
  if (options.transpileTs === true) {
    const enumNames = new Set<string>();
    for (const node of program.body) {
      let enumDecl: TSEnumDeclaration | null = null;
      if (node.type === 'TSEnumDeclaration') {
        enumDecl = node;
      } else if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'TSEnumDeclaration'
      ) {
        enumDecl = node.declaration;
      }
      if (enumDecl?.id?.name) {
        enumNames.add(enumDecl.id.name);
      }
    }
    if (enumNames.size > 0) {
      for (const [, usedNames] of segmentUsage) {
        for (const name of enumNames) {
          usedNames.delete(name);
        }
      }
    }
  }

  let migrationDecisions = analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage, program);
  if (isInlineStrategy) {
    migrationDecisions = filterInlineStrategyMigrations(migrationDecisions);
    dropTopLevelModuleScopeCaptures(extractions, moduleLevelDeclsByName);
  }

  return {
    moduleLevelDecls,
    moduleLevelDeclsByName,
    segmentUsage,
    migrationDecisions,
  };
}

/**
 * Prod mode: rename symbols to `s_<hash>`. Returns the renamed → original map used for
 * migration-decision keying.
 */
function applyProdRename(
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  emitMode: EmitMode
): Map<SymbolName, SymbolName> {
  const preRenameSymbolName = new Map<SymbolName, SymbolName>();
  if (emitMode !== 'prod') return preRenameSymbolName;

  for (const ext of extractions) {
    // inlinedQrl extractions are renamed under prod too, preserving the hash
    // suffix. Runtime QRL resolution is hash-keyed, not name-keyed, so the
    // rename is safe even for peer-tool-supplied names.
    const original = ext.symbolName;
    // Internal-builder cast: rename mutates identity in place post-extraction.
    (ext as Mutable<ExtractionResult>).symbolName = mkSymbolName('s_' + ext.hash);
    preRenameSymbolName.set(ext.symbolName, original);
    // Mirror the rename in `closureNodes` so post-rename lookups still resolve.
    const closure = closureNodes.get(original);
    if (closure) {
      closureNodes.delete(original);
      closureNodes.set(ext.symbolName, closure);
    }
  }
  return preRenameSymbolName;
}

/**
 * Downgrade extraction extensions for the transpile targets. Returns the pre-downgrade extension
 * per symbol (segment codegen needs the source dialect even after the output extension changes).
 */
function downgradeExtensions(
  extractions: ExtractionResult[],
  shouldTranspileJsx: boolean,
  shouldTranspileTs: boolean
): Map<string, string> {
  const sourceExtensions = new Map<string, string>();
  for (const extraction of extractions) {
    sourceExtensions.set(extraction.symbolName, extraction.extension);
  }

  // In-place mutation via internal-builder cast.
  if (shouldTranspileJsx || shouldTranspileTs) {
    for (const extraction of extractions) {
      const wip = extraction as Mutable<ExtractionResult>;
      if (shouldTranspileJsx) {
        if (wip.extension === '.tsx') wip.extension = shouldTranspileTs ? '.js' : '.ts';
        else if (wip.extension === '.jsx') wip.extension = '.js';
        else if (shouldTranspileTs && wip.extension === '.ts') wip.extension = '.js';
      } else if (shouldTranspileTs) {
        if (wip.extension === '.ts') wip.extension = '.js';
        else if (wip.extension === '.tsx') wip.extension = '.jsx';
      }
    }
  }
  return sourceExtensions;
}

/** Phase 4: rewrite the parent module; emits C05 + passive-conflict diagnostics. */
function rewriteParent(
  mod: ModuleContext,
  prepared: PreparedModuleInput,
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  analysis: CaptureAnalysis,
  migration: MigrationAnalysis,
  emit: EmitConfig,
  diagnostics: Diagnostic[]
): ParentRewrite {
  const { input, options, relPath, ext } = mod;
  const { repairedCode, program, parserModule, hasForeignJsxRuntime } = prepared;

  const hasLocalInlinedQrl = extractions.some(
    (e) => e.isInlinedQrl && !relPath.includes('node_modules')
  );
  let devFile: string | undefined;
  if (emit.emitMode === 'dev' || emit.emitMode === 'hmr' || hasLocalInlinedQrl) {
    devFile = buildDevFilePath(input.path, options.srcDir, input.devPath);
  }

  let jsxOptions: JsxRewriteOptions | undefined;
  if (emit.shouldTranspileJsx && (ext === '.tsx' || ext === '.jsx')) {
    jsxOptions = {
      enableJsx: true,
      importedNames: analysis.importedNames,
      enableSignals: true,
      // Phase-2 gather-walk projection; saves transformAllJsx its own bindings
      // walk. Positions are plain numbers, so intervening parses can't
      // invalidate them.
      precomputedScopeBindings: analysis.scopeAwareBindings,
    };
  }

  let strategyOptions: InlineStrategyOptions | undefined;
  if (emit.isInlineStrategy) {
    strategyOptions = {
      inline: true,
      entryType: emit.entryStrategy.type as 'inline' | 'hoist',
      isLibMode: emit.isLibMode,
      stripCtxName: options.stripCtxName,
      stripEventHandlers: options.stripEventHandlers,
      regCtxName: options.regCtxName,
    };
  } else if (options.stripCtxName || options.stripEventHandlers || options.regCtxName) {
    strategyOptions = {
      inline: false,
      stripCtxName: options.stripCtxName,
      stripEventHandlers: options.stripEventHandlers,
      regCtxName: options.regCtxName,
    };
  }

  const parentResult = rewriteParentModule(
    repairedCode,
    relPath,
    extractions,
    analysis.originalImports,
    migration.migrationDecisions,
    migration.moduleLevelDecls,
    jsxOptions,
    emit.emitMode,
    devFile,
    strategyOptions,
    options.stripExports,
    options.isServer,
    options.explicitExtensions,
    options.transpileTs,
    options.minify,
    emit.qrlOutputExt,
    program,
    closureNodes,
    input.devPath,
    hasForeignJsxRuntime
  );

  const parentCode = applySegmentDCE(parentResult.code);
  const cleanedCode = removeUnusedImports(
    parentCode,
    relPath,
    options.transpileJsx,
    undefined,
    emit.isLibMode
  );
  const parentModule: TransformModule = {
    kind: 'parent',
    path: relPath,
    isEntry: false,
    code: cleanedCode,
    map: null,
    origPath: input.path,
  };

  detectC05Diagnostics(
    program,
    parserModule,
    analysis.originalImports,
    repairedCode,
    relPath,
    diagnostics
  );

  if (ext === '.tsx' || ext === '.jsx') {
    emitPassiveConflictDiagnostics(analysis.passiveConflicts, relPath, repairedCode, diagnostics);
  }

  return { parentModule, parentResult, devFile };
}

/**
 * Phase 5: generate one module per non-stripped segment. Always runs the pipeline (lib mode relies
 * on its side effects during the parent inline collapse) but returns no modules in lib mode —
 * bodies were inlined into the parent.
 */
function generateSegments(
  mod: ModuleContext,
  prepared: PreparedModuleInput,
  parent: ParentRewrite,
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  analysis: CaptureAnalysis,
  migration: MigrationAnalysis,
  emit: EmitConfig,
  preRenameSymbolName: Map<SymbolName, SymbolName>,
  sourceExtensions: Map<string, string>,
  isJsx: boolean
): TransformModule[] {
  const { input, options, relPath, ext } = mod;
  const { repairedCode, program, hasForeignJsxRuntime, foreignJsxPragmaText } = prepared;
  const { parentResult, devFile } = parent;

  // `parentResult.extractions` is already `ConsolidatedSegment[]` — the parent
  // rewrite flipped the phase discriminator after `resolveNesting`.
  const updatedExtractions = parentResult.extractions;

  // Resolve const-literal captures for child segments (default strategy only).
  const constLiteralsMap = new Map<string, Map<string, string>>();
  if (!emit.isInlineStrategy) {
    for (const ext of updatedExtractions) {
      if (ext.isSync || ext.parent === null) continue;
      if (ext.constLiterals && ext.constLiterals.size > 0) {
        constLiteralsMap.set(ext.symbolName, ext.constLiterals);
      }
      if (ext.captureNames.length === 0) continue;
      const parentExt = updatedExtractions.find((e) => e.symbolName === ext.parent);
      if (!parentExt) continue;
      const parentClosure = closureNodes.get(parentExt.symbolName);
      if (!parentClosure) continue;
      const constValues = resolveConstLiteralsInClosure(
        parentClosure,
        repairedCode,
        ext.captureNames
      );
      if (constValues.size > 0) {
        const existing = constLiteralsMap.get(ext.symbolName);
        if (existing) {
          for (const [k, v] of constValues) existing.set(k, v);
        } else {
          constLiteralsMap.set(ext.symbolName, constValues);
        }
        ext.captureNames = ext.captureNames.filter((n) => !constValues.has(n));
        ext.captures = ext.captureNames.length > 0;
      }
    }
  }

  const segmentCtx: SegmentGenerationContext = {
    // Same array as `updatedExtractions` (mutated in place); narrowed for Phase 5.
    extractions: extractions as ConsolidatedSegment[],
    updatedExtractions,
    closureNodes,
    program,
    originalImports: analysis.originalImports,
    options,
    repairedCode,
    relPath,
    // Original consumer-supplied `input.path` (vs the srcDir-relative
    // `relPath`). Segment `module.path` derives its directory from this so
    // output paths share the input's namespace — absolute in, absolute out.
    inputPath: input.path,
    emitMode: emit.emitMode,
    devFile,
    userDevPath: input.devPath,
    isInlineStrategy: emit.isInlineStrategy,
    entryStrategy: emit.entryStrategy,
    migrationDecisions: migration.migrationDecisions,
    moduleLevelDecls: migration.moduleLevelDecls,
    moduleLevelDeclsByName: migration.moduleLevelDeclsByName,
    movedDeclSnapshots: parentResult.movedDeclSnapshots,
    segmentUsage: migration.segmentUsage,
    parentModulePath: emit.parentModulePath,
    preRenameSymbolName,
    qrlOutputExt: emit.qrlOutputExt,
    sourceExtensions,
    // Drives oxc-transform's parser-dialect selection; falls back to `.tsx`
    // (parses both TS and JSX) when the extension is missing.
    parentSourceExt: ext || '.tsx',
    shouldTranspileJsx: emit.shouldTranspileJsx,
    shouldTranspileTs: emit.shouldTranspileTs,
    isJsx,
    importedNames: analysis.importedNames,
    enclosingExtMap: analysis.enclosingExtMap,
    elementQpParamsMap: analysis.elementQpParamsMap,
    extractionLoopMap: analysis.extractionLoopMap,
    constLiteralsMap,
    parentJsxKeyCounterValue: parentResult.jsxKeyCounterValue ?? 0,
    hasForeignJsxRuntime,
    foreignJsxPragmaText,
  };

  const segmentModules = generateAllSegmentModules(segmentCtx);
  // lib mode inlines segment bodies into the parent; skip emitting the
  // separately-generated segment modules.
  if (emit.isLibMode) {
    return [];
  }
  return segmentModules;
}

/** Phase 6: apply diagnostic suppression directives (cross-file). */
function applyDiagnosticSuppression(
  diagnostics: Diagnostic[],
  inputs: readonly TransformModuleInput[]
): Diagnostic[] {
  let filtered = diagnostics;
  for (const input of inputs) {
    const directives = parseDisableDirectives(input.code);
    if (directives.size > 0) {
      filtered = filterSuppressedDiagnostics(filtered, directives);
    }
  }
  return filtered;
}
