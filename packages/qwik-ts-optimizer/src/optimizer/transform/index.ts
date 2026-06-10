/**
 * Public entry point for the Qwik optimizer.
 *
 * transformModule() accepts TransformModulesOptions and returns TransformOutput,
 * wiring together extraction, capture analysis, variable migration, parent
 * rewriting, and segment codegen into a single public API matching the NAPI
 * binding interface.
 */

import type {
  AstFunction,
  TSEnumDeclaration,
} from "../../ast-types.js";
import { parseWithRawTransfer } from "../utils/parse.js";
import { flattenAndReparse } from "../utils/flatten-destructures.js";
import { detectForeignJsxRuntime } from "../utils/jsx-import-source.js";
import { extractSegments } from "../extract.js";
import type { ConsolidatedSegment, ExtractionResult, Mutable } from "../extract.js";
import { repairInput } from "../input-repair.js";
import {
  rewriteParentModule,
  resolveConstLiteralsInClosure,
} from "../rewrite/index.js";
import { collectImports } from "../marker-detection.js";
import { buildDevFilePath } from "../dev-mode.js";
import { isStrippedSegment } from "../rewrite/predicates.js";
import { isSimpleIdentifierName } from '../utils/identifier-name.js';
import { type SymbolName, mkSymbolName } from '../types/brands.js';
import {
  analyzeCaptures,
  buildClosureLexicalScopes,
  collectScopeIdentifiers,
} from "../capture-analysis.js";
import {
  analyzeMigration,
  collectModuleLevelDecls,
  computeSegmentUsage,
} from "../variable-migration.js";
import type {
  TransformModulesOptions,
  TransformOutput,
  TransformModule,
} from "../types.js";
import {
  classifyDeclarationType,
  classifyDeclarationTypeInClosure,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from "../diagnostics.js";
import {
  computeOutputExtension,
  computeParentModulePath,
  computeRelPath,
  getExtension,
} from "../path-utils.js";
import {
  buildParentExtractionMap,
  buildPassthroughModule,
  removeUnusedImports,
} from './module-cleanup.js';
import { applySegmentDCE } from './dead-code.js';
import {
  detectC02Diagnostics,
  detectC05Diagnostics,
  detectPassivePreventdefaultConflicts,
} from './diagnostic-detection.js';
import {
  leadingSquareBracket,
  trailingSquareBracket,
  paddingParam,
} from './post-process.js';
import {
  buildExtractionLoopMap,
  collectAllScopeEntries,
  promoteEventHandlerCaptures,
  unifyParameterSlots,
  buildElementCaptureMap,
  type EventCaptureContext,
} from './event-capture-promotion.js';
import {
  generateAllSegmentModules,
  type SegmentGenerationContext,
} from './segment-generation.js';

/**
 * Transform Qwik source modules by extracting segments, rewriting the parent
 * module, and generating segment module code.
 *
 * This is the public API consumed by the Qwik Vite plugin, matching the NAPI
 * binding interface.
 *
 * Pipeline per input file:
 *   repair -> extract -> analyze captures -> migrate -> rewrite parent -> generate segments
 */
export function transformModule(
  options: TransformModulesOptions,
): TransformOutput {
  const allModules: TransformModule[] = [];
  const diagnostics: import("../types.js").Diagnostic[] = [];
  let isTypeScript = false;
  let isJsx = false;

  for (const input of options.input) {
    const relPath = computeRelPath(input.path, options.srcDir);
    const ext = getExtension(relPath);

    if (ext === ".ts" || ext === ".tsx") isTypeScript = true;
    if (ext === ".tsx" || ext === ".jsx") isJsx = true;

    // Phase 0: Repair input for SWC-recoverable parse errors.
    // When the caller supplies a pre-parsed Program (typically from a
    // bundler's `meta.ast`), `repairInput` uses it directly and skips
    // its internal parse.
    const repairResult = repairInput(
      input.code,
      relPath,
      input.program,
      input.module,
    );
    let repairedCode = repairResult.source;
    // Single module AST for extraction and the rest of the pipeline. When
    // repair already produced a program, reuse it; otherwise parse once here
    // so extractSegments does not parse the same source again internally.
    let { program, module: parserModule } = repairResult.program
      ? { program: repairResult.program, module: repairResult.module }
      : parseWithRawTransfer(relPath, repairedCode);

    // Phase 0.5: Flatten `const {x} = useFoo()` inside `component$` bodies
    // to `const foo = useFoo()` + reference rewrites. Mirrors SWC's
    // `props_destructuring::transform_component_body` (a code-size
    // optimization applied before extraction). Runs after repair so the
    // AST positions are valid. If the rewrite produced changes, re-parse
    // so downstream phases see the rewritten source.
    const flattened = flattenAndReparse(repairedCode, relPath, program);
    if (flattened.changed) {
      repairedCode = flattened.source;
      program = flattened.program;
      parserModule = flattened.module ?? parserModule;
    }

    // Detect foreign `@jsxImportSource` pragma once per source. Threaded
    // into rewrite + segment generation so both phases skip Qwik's
    // JSX-syntax rewrite and let oxc-transform's default JSX transform
    // handle the file using the pragma-named runtime.
    const { hasForeignJsxRuntime, pragmaText: foreignJsxPragmaText } =
      detectForeignJsxRuntime(repairedCode);

    // Phase 1: Extract $() segments
    const willTranspileJsx =
      options.transpileJsx !== false && (ext === ".tsx" || ext === ".jsx");
    // Closure AST nodes (the `arg` of each marker call) are threaded out by
    // `extractSegments` keyed by post-disambiguation `symbolName`, so
    // downstream phases reuse the original parse instead of re-parsing each
    // extraction's body.
    const closureNodes = new Map<string, AstFunction>();
    // `extractSegments` returns `readonly ExtractedSegment[]` as its
    // phase-locked contract. The orchestrator below applies in-place
    // mutations (prod rename, transpile-downgrade, capture analysis,
    // raw-props consolidation) that gradually advance the array elements
    // through `captured` → `consolidated` phases. The cast here is the
    // single FFI-boundary widening; per-mutation `Mutable` casts handle
    // field-level readonly enforcement.
    const extractions: ExtractionResult[] = extractSegments(
      repairedCode,
      relPath,
      options.scope,
      willTranspileJsx,
      program,
      parserModule,
      closureNodes,
      // Explicit user-set transpileJsx flag (defaults to false) for the
      // ctxKind classifier. Distinct from `willTranspileJsx` which
      // defaults to true on .tsx/.jsx (TS auto-transpile).
      options.transpileJsx === true,
    ) as ExtractionResult[];

    // Early exit: no segments and no JSX to transpile
    const needsJsxTransform =
      options.transpileJsx !== false && (ext === ".tsx" || ext === ".jsx");
    if (extractions.length === 0 && !needsJsxTransform) {
      allModules.push(
        buildPassthroughModule(
          repairedCode,
          relPath,
          input.path,
          program,
        ),
      );
      continue;
    }

    // Phase 2: Collect imports and analyze captures
    const originalImports = collectImports(program, parserModule);
    const importedNames = new Set<string>(originalImports.keys());

    const enclosingExtMap = buildParentExtractionMap(extractions);

    // Capture analysis: determine which variables each extraction captures
    const moduleScopeIds = collectScopeIdentifiers(
      program,
      repairedCode,
      relPath,
    );

    // Collect scope identifiers from each segment's body for nested capture
    // analysis. The closure AST nodes themselves were already populated by
    // `extractSegments` above — no body re-parse needed.
    const bodyScopeIds = new Map<string, Set<string>>();
    for (const [symbolName, closureNode] of closureNodes) {
      const bodyIds = collectScopeIdentifiers(closureNode, "", "");
      bodyScopeIds.set(symbolName, bodyIds);
    }

    // Lexical scope chain per closure. Module-scope-only and
    // enclosing-extraction-only fallbacks both miss decls from
    // intermediate non-marker enclosing functions (e.g. a module-level
    // arrow wrapping a `useVisibleTask$(...)` call). The map produced
    // here is the union of every enclosing function/arrow scope plus
    // module scope at the closure's location.
    const closureLexicalScopes = buildClosureLexicalScopes(program, closureNodes);

    // Run capture analysis with the correct parent scope for each extraction.
    for (const extraction of extractions) {
      const closureNode = closureNodes.get(extraction.symbolName);
      if (!closureNode) continue;

      const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;

      const lexicalScope = closureLexicalScopes.get(extraction.symbolName);
      const parentScopeIds: Set<string> = lexicalScope ?? moduleScopeIds;

      // For inlinedQrl extractions, populate captureNames from explicit captures
      if (extraction.isInlinedQrl) {
        if (extraction.explicitCaptures) {
          const items = extraction.explicitCaptures
            .replace(leadingSquareBracket, "")
            .replace(trailingSquareBracket, "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          const identCaptures = items.filter(
            (s) =>
              isSimpleIdentifierName(s) &&
              s !== "true" &&
              s !== "false" &&
              s !== "null" &&
              s !== "undefined",
          );
          extraction.captureNames = identCaptures;
          extraction.captures = identCaptures.length > 0;
        }
        continue;
      }

      const result = analyzeCaptures(
        closureNode,
        parentScopeIds,
      );
      extraction.captureNames = result.captureNames;
      extraction.paramNames = result.paramNames;
      extraction.captures = result.captures;

      // Filter out function/class declarations from captures.
      if (extraction.captureNames.length > 0) {
        const enclosingClosure = enclosingExt
          ? closureNodes.get(enclosingExt.symbolName)
          : undefined;
        extraction.captureNames = extraction.captureNames.filter((name) => {
          const declType = enclosingClosure
            ? classifyDeclarationTypeInClosure(enclosingClosure, name)
            : classifyDeclarationType(program, name);
          return declType === "var";
        });
        extraction.captures = extraction.captureNames.length > 0;
      }

      // Reconcile captures with paramNames
      if (extraction.captures && extraction.paramNames.length > 0) {
        const paramSet = new Set(extraction.paramNames);
        const allCapturesInParams = extraction.captureNames.every((name) =>
          paramSet.has(name),
        );
        if (allCapturesInParams) {
          extraction.captures = false;
        }
      }
    }

    // Resolve const literals for event handlers before capture-to-param promotion
    for (const extraction of extractions) {
      if (extraction.ctxKind !== "eventHandler") continue;
      if (extraction.isInlinedQrl || extraction.captureNames.length === 0)
        continue;
      const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;
      if (!enclosingExt) continue;
      const enclosingClosure = closureNodes.get(enclosingExt.symbolName);
      if (!enclosingClosure) continue;
      const constValues = resolveConstLiteralsInClosure(
        enclosingClosure,
        repairedCode,
        extraction.captureNames,
      );
      if (constValues.size > 0) {
        extraction.constLiterals = constValues;
        extraction.captureNames = extraction.captureNames.filter(
          (n) => !constValues.has(n),
        );
        extraction.captures = extraction.captureNames.length > 0;
      }
    }

    // Event handler capture-to-param promotion (q:p delivery mechanism)
    const globalDeclPositions = new Map<string, number>();
    const { extractionLoopMap, loopBodyVarDecls } = buildExtractionLoopMap(program, extractions, repairedCode);
    const allScopeEntries = collectAllScopeEntries(program);
    // `mode: 'lib'` produces a single-module library output (segment
    // bodies inlined as `inlinedQrl(body, name, [captures])` literals).
    // Re-uses the inline pipeline for body emission + capture wiring; a
    // post-pass in `output-assembly.ts` collapses the inline output
    // (`const q_X = _noopQrl(...); q_X.s(body);`) into the lib shape
    // (`inlinedQrl(body, name, [caps])`).
    const userEntryStrategy = options.entryStrategy ?? { type: "smart" as const };
    const earlyEntryStrategy = options.mode === 'lib'
      ? { type: 'inline' as const }
      : userEntryStrategy;
    // Only `inline` (not `hoist`) skips the captures→paramNames
    // promotion. `hoist` emits `(_, _1, capture) => body` const
    // declarations, so it still needs the param-padding form. `inline`
    // emits `q_X.s((origArg) => { const _rawProps = _captures[0]; ... })`,
    // which requires keeping captures in `captureNames` for the
    // downstream `_captures[N]` unpacking pipeline.
    const earlyIsInlineStrategy = earlyEntryStrategy.type === "inline";
    const eventCaptureCtx: EventCaptureContext = {
      extractions,
      closureNodes,
      bodyScopeIds,
      moduleScopeIds,
      importedNames,
      enclosingExtMap,
      extractionLoopMap,
      allScopeEntries,
      loopBodyVarDecls,
      repairedCode,
      isInlineStrategy: earlyIsInlineStrategy,
    };

    promoteEventHandlerCaptures(eventCaptureCtx, globalDeclPositions);

    // Unify parameter slots for multiple event handlers on the same element
    unifyParameterSlots(eventCaptureCtx, globalDeclPositions);

    // Build elementQpParams map. Threads strip-config so stripped event
    // handlers' captures populate `elementQpParamsMap` for segment-body
    // JSX (`buildQpOverrides` in segment-codegen looks up by handler
    // symbolName via `nestedCallSite.elementQpParams`).
    const elementQpParamsMap = buildElementCaptureMap(
      eventCaptureCtx,
      globalDeclPositions,
      options.stripCtxName,
      options.stripEventHandlers,
    );

    detectC02Diagnostics(
      extractions,
      closureNodes,
      enclosingExtMap,
      importedNames,
      program,
      repairedCode,
      relPath,
      diagnostics,
    );

    // Flip the `phase` discriminator from 'extracted' to 'captured' now
    // that Phase 2 capture analysis has populated `captureNames` /
    // `paramNames`. Internal-builder cast (FFI-boundary pattern,
    // matching the prod-rename + transpile-downgrade sites above) — the
    // alternative is a full pass-through `.map()` to construct new
    // objects.
    for (const extraction of extractions) {
      (extraction as Mutable<ExtractionResult>).phase = 'captured';
    }

    // Phase 3: Variable migration analysis
    const moduleLevelDecls = collectModuleLevelDecls(program, repairedCode);
    const moduleLevelDeclsByName = new Map<
      string,
      (typeof moduleLevelDecls)[0]
    >();
    for (const d of moduleLevelDecls) {
      moduleLevelDeclsByName.set(d.name, d);
    }
    // Include both `$()` and `inlinedQrl(...)` extractions: module-level
    // references inside a peer-tool-emitted `inlinedQrl` body (e.g. qwik-react
    // codegen) still need migration attribution. The explicit-captures list on
    // `inlinedQrl` only covers closure variables — module-level decls referenced
    // in the body (like a peer-tool's shared `filterProps`) are NOT in the
    // captures and need usage attribution via the program walk.
    const { segmentUsage, rootUsage } = computeSegmentUsage(
      program,
      extractions,
    );

    // Augment segmentUsage with captureNames from scope-aware capture analysis.
    // (For `inlinedQrl` extractions, the explicit captures are already in
    // `captureNames` — this also folds them into `segmentUsage` so they read
    // back consistently with `$()` extractions.)
    for (const ext of extractions) {
      const usage = segmentUsage.get(ext.symbolName);
      if (usage && ext.captureNames) {
        for (const name of ext.captureNames) {
          usage.add(name);
        }
      }
    }

    // Variables delivered via q:ps (paramNames captures) are referenced by the parent
    for (const ext of extractions) {
      if (ext.ctxKind !== "eventHandler") continue;
      if (
        ext.paramNames.length < 3 ||
        ext.paramNames[0] !== "_" ||
        ext.paramNames[1] !== "_1"
      )
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

    // When transpileTs is enabled, TS enum values are inlined into segment bodies
	  if (options.transpileTs === true) {
	    const enumNames = new Set<string>();
	    for (const node of program.body) {
	      let enumDecl: TSEnumDeclaration | null = null;
	      if (node.type === "TSEnumDeclaration") {
	        enumDecl = node;
        } else if (
          node.type === "ExportNamedDeclaration" &&
          node.declaration?.type === "TSEnumDeclaration"
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

    // Compute output extension early (before `ext` is shadowed by extraction loop)
    const qrlOutputExt = computeOutputExtension(
      ext,
      options.transpileTs,
      options.transpileJsx,
    );

    // Same override as the `earlyEntryStrategy` resolution above.
    // `mode: 'lib'` forces inline-pipeline emission; the lib-specific
    // collapse happens as a post-pass.
    const entryStrategy = options.mode === 'lib'
      ? { type: 'inline' as const }
      : (options.entryStrategy ?? { type: "smart" as const });
    const isInlineStrategy =
      entryStrategy.type === "inline" || entryStrategy.type === "hoist";
    const isLibMode = options.mode === 'lib';
    // Under inline strategy, segment bodies stay in the parent module
    // (inside `q_X.s(body)`), so a `move` decision would delete a decl
    // that the body still references — broken. Run migration and keep
    // only `reexport` decisions; SWC emits these too, presumably for
    // API stability across the segment-file ↔ inline output forms.
    const migrationDecisions = isInlineStrategy
      ? analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage)
          .filter((d) => d.action === 'reexport')
      : analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage);

    const parentModulePath = computeParentModulePath(
      relPath,
      options.explicitExtensions,
    );

    // Prod mode: rename symbols to s_{hash}
    const preRenameSymbolName = new Map<SymbolName, SymbolName>();
    const emitMode = options.mode ?? "prod";
    if (emitMode === "prod") {
      for (const ext of extractions) {
        // `inlinedQrl` extractions get renamed under prod too. SWC
        // renames them (e.g. `App_component_Fh88JClhbC0` →
        // `s_Fh88JClhbC0`), preserving the hash suffix so runtime QRL
        // resolution still matches. The runtime uses hash-keyed lookup,
        // not the symbolic name, so the rename is safe even for
        // peer-tool-supplied names.
        const original = ext.symbolName;
        // Prod rename mutates identity post-extraction. Internal-builder
        // cast — the alternative is a full pass-through `array.map()`.
        (ext as Mutable<ExtractionResult>).symbolName = mkSymbolName("s_" + ext.hash);
        preRenameSymbolName.set(ext.symbolName, original);
        // Mirror the rename in `closureNodes` so post-rename lookups (Phase 4
        // const-literal resolution, etc.) still find the threaded AST node.
        const closure = closureNodes.get(original);
        if (closure) {
          closureNodes.delete(original);
          closureNodes.set(ext.symbolName, closure);
        }
      }
    }

    // Phase 4: Rewrite parent module
    const hasLocalInlinedQrl = extractions.some(
      (e) => e.isInlinedQrl && !relPath.includes("node_modules"),
    );
    const devFile =
      emitMode === "dev" || emitMode === "hmr" || hasLocalInlinedQrl
        ? buildDevFilePath(input.path, options.srcDir, input.devPath)
        : undefined;

    const shouldTranspileJsx = options.transpileJsx !== false;
    const shouldTranspileTs = options.transpileTs === true;

    // Save source extensions before downgrading
    const sourceExtensions = new Map<string, string>();
    for (const extraction of extractions) {
      sourceExtensions.set(extraction.symbolName, extraction.extension);
    }

    // When JSX will be transpiled, downgrade extensions on extraction
    // results. In-place mutation via internal-builder cast — see the
    // prod-rename comment above.
    if (shouldTranspileJsx || shouldTranspileTs) {
      for (const extraction of extractions) {
        const wip = extraction as Mutable<ExtractionResult>;
        if (shouldTranspileJsx) {
          if (wip.extension === ".tsx")
            wip.extension = shouldTranspileTs ? ".js" : ".ts";
          else if (wip.extension === ".jsx")
            wip.extension = ".js";
          else if (shouldTranspileTs && wip.extension === ".ts")
            wip.extension = ".js";
        } else if (shouldTranspileTs) {
          if (wip.extension === ".ts") wip.extension = ".js";
          else if (wip.extension === ".tsx")
            wip.extension = ".jsx";
        }
      }
    }

    const parentResult = rewriteParentModule(
      repairedCode,
      relPath,
      extractions,
      originalImports,
      migrationDecisions,
      moduleLevelDecls,
      shouldTranspileJsx && (ext === ".tsx" || ext === ".jsx")
        ? { enableJsx: true, importedNames, enableSignals: true }
        : undefined,
      emitMode,
      devFile,
      isInlineStrategy
        ? {
            inline: true,
            entryType: entryStrategy.type as "inline" | "hoist",
            isLibMode,
            stripCtxName: options.stripCtxName,
            stripEventHandlers: options.stripEventHandlers,
            regCtxName: options.regCtxName,
          }
        : options.stripCtxName ||
            options.stripEventHandlers ||
            options.regCtxName
          ? {
              inline: false,
              stripCtxName: options.stripCtxName,
              stripEventHandlers: options.stripEventHandlers,
              regCtxName: options.regCtxName,
            }
          : undefined,
      options.stripExports,
      options.isServer,
      options.explicitExtensions,
      options.transpileTs,
      options.minify,
      qrlOutputExt,
      program,
      closureNodes,
      input.devPath,
      hasForeignJsxRuntime,
    );

    // Post-process parent: DCE + unused import cleanup
    let parentCode = applySegmentDCE(parentResult.code);
    const cleanedCode = removeUnusedImports(
      parentCode,
      relPath,
      options.transpileJsx,
      undefined,
      isLibMode,
    );
    const parentModule: TransformModule = {
      kind: 'parent',
      path: relPath,
      isEntry: false,
      code: cleanedCode,
      map: null,
      origPath: input.path,
    };
    allModules.push(parentModule);

    detectC05Diagnostics(
      program,
      parserModule,
      originalImports,
      repairedCode,
      relPath,
      diagnostics,
    );

    if (ext === ".tsx" || ext === ".jsx") {
      detectPassivePreventdefaultConflicts(
        program,
        relPath,
        repairedCode,
        diagnostics,
      );
    }

    // Phase 5: Generate segment modules. `parentResult.extractions` is
    // already typed as `ConsolidatedSegment[]` — `rewriteParentModule`
    // flips the phase discriminator after `resolveNesting`.
    const updatedExtractions = parentResult.extractions;

    // Pre-pass: resolve const literal captures for child segments (default strategy only).
    const constLiteralsMap = new Map<string, Map<string, string>>();
    if (!isInlineStrategy) {
      for (const ext of updatedExtractions) {
        if (ext.isSync || ext.parent === null) continue;
        if (ext.constLiterals && ext.constLiterals.size > 0) {
          constLiteralsMap.set(ext.symbolName, ext.constLiterals);
        }
        if (ext.captureNames.length === 0) continue;
        const parentExt = updatedExtractions.find(e => e.symbolName === ext.parent);
        if (!parentExt) continue;
        const parentClosure = closureNodes.get(parentExt.symbolName);
        if (!parentClosure) continue;
        const constValues = resolveConstLiteralsInClosure(
          parentClosure,
          repairedCode,
          ext.captureNames,
        );
        if (constValues.size > 0) {
          const existing = constLiteralsMap.get(ext.symbolName);
          if (existing) {
            for (const [k, v] of constValues) existing.set(k, v);
          } else {
            constLiteralsMap.set(ext.symbolName, constValues);
          }
          ext.captureNames = ext.captureNames.filter(
            (n) => !constValues.has(n),
          );
          ext.captures = ext.captureNames.length > 0;
        }
      }
    }

    const segmentCtx: SegmentGenerationContext = {
      // Same array as `updatedExtractions` (`rewriteParentModule`
      // mutates in place); cast to the narrow variant for Phase 5 typing.
      extractions: extractions as ConsolidatedSegment[],
      updatedExtractions,
      program,
      originalImports,
      options,
      repairedCode,
      relPath,
      // Original consumer-supplied `input.path` (vs `relPath`, which is
      // `input.path` made srcDir-relative). Segment `module.path` derives
      // its directory portion from this so output paths live in the same
      // namespace as inputs — when a bundler passes absolute paths, the
      // emitted segment paths are absolute too, matching SWC's behavior.
      inputPath: input.path,
      emitMode,
      devFile,
      userDevPath: input.devPath,
      isInlineStrategy,
      entryStrategy,
      migrationDecisions,
      moduleLevelDecls,
      moduleLevelDeclsByName,
      movedDeclSnapshots: parentResult.movedDeclSnapshots,
      segmentUsage,
      parentModulePath,
      preRenameSymbolName,
      qrlOutputExt,
      sourceExtensions,
      // The parent input file's extension drives oxc-transform's
      // parser-dialect selection in `postProcessSegmentCode`. Falls back
      // to `.tsx` (parses TS + JSX, covers both) when extension is missing.
      parentSourceExt: ext || '.tsx',
      shouldTranspileJsx,
      shouldTranspileTs,
      isJsx,
      importedNames,
      enclosingExtMap,
      elementQpParamsMap,
      extractionLoopMap,
      constLiteralsMap,
      parentJsxKeyCounterValue: parentResult.jsxKeyCounterValue ?? 0,
      hasForeignJsxRuntime,
      foreignJsxPragmaText,
    };

    const segmentModules = generateAllSegmentModules(segmentCtx);
    // lib mode produces a single-module library output. The segment-file
    // modules are still generated (extraction + capture analysis runs)
    // but the bodies are inlined into the parent module via
    // `collapseToLibInlinedQrl`. Skip emitting the segment modules.
    if (!isLibMode) {
      allModules.push(...segmentModules);
    }
  }

  // Phase 6: Apply diagnostic suppression directives
  let filteredDiagnostics = diagnostics;
  for (const input of options.input) {
    const directives = parseDisableDirectives(input.code);
    if (directives.size > 0) {
      filteredDiagnostics = filterSuppressedDiagnostics(
        filteredDiagnostics,
        directives,
      );
    }
  }

  return {
    modules: allModules,
    diagnostics: filteredDiagnostics,
    isTypeScript,
    isJsx,
  };
}
