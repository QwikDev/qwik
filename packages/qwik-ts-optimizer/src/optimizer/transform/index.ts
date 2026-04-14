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
  AstProgram,
  AstEcmaScriptModule,
  TSEnumDeclaration,
} from "../../ast-types.js";
import { parseWithRawTransfer } from "../../utils/parse.js";
import { extractSegments } from "../extract.js";
import { repairInput } from "../input-repair.js";
import {
  rewriteParentModule,
  resolveConstLiterals,
} from "../rewrite/index.js";
import { collectImports } from "../marker-detection.js";
import { buildDevFilePath } from "../dev-mode.js";
import { isStrippedSegment } from "../strip-ctx.js";
import { isSimpleIdentifierName } from '../utils/identifier-name.js';
import {
  analyzeCaptures,
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
  buildEnclosingExtractionMap,
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
  buildElementQpParamsMap,
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

    // Phase 0: Repair input for SWC-recoverable parse errors
    const repairResult = repairInput(input.code, relPath);
    const repairedCode = repairResult.source;

    // Phase 1: Extract $() segments
    const willTranspileJsx =
      options.transpileJsx !== false && (ext === ".tsx" || ext === ".jsx");
    const extractions = extractSegments(
      repairedCode,
      relPath,
      options.scope,
      willTranspileJsx,
      repairResult.program,
    );

    // Early exit: no segments and no JSX to transpile
    const needsJsxTransform =
      options.transpileJsx !== false && (ext === ".tsx" || ext === ".jsx");
    if (extractions.length === 0 && !needsJsxTransform) {
      allModules.push(
        buildPassthroughModule(
          repairedCode,
          relPath,
          input.path,
          repairResult.program,
        ),
      );
      continue;
    }

    // Phase 2: Collect imports and analyze captures
    const parseResult: { program: AstProgram; module: AstEcmaScriptModule | undefined } =
      repairResult.program
        ? { program: repairResult.program, module: repairResult.module }
        : parseWithRawTransfer(relPath, repairedCode);
    const program = parseResult.program;
    const parserModule = parseResult.module;
    const originalImports = collectImports(program, parserModule);
    const importedNames = new Set<string>(originalImports.keys());

    const enclosingExtMap = buildEnclosingExtractionMap(extractions);

    // Capture analysis: determine which variables each extraction captures
    const moduleScopeIds = collectScopeIdentifiers(
      program,
      repairedCode,
      relPath,
    );

    // Pre-parse each extraction's body to get closure AST nodes, and collect
    // scope identifiers from each body (needed for nested capture analysis)
    const closureNodes = new Map<string, AstFunction>();
    const bodyScopeIds = new Map<string, Set<string>>();
    const bodyPrograms = new Map<string, AstProgram>();

    for (const extraction of extractions) {
      try {
        const wrappedBody = `(${extraction.bodyText})`;
        const bodyParse = parseWithRawTransfer("segment.tsx", wrappedBody);
        bodyPrograms.set(extraction.symbolName, bodyParse.program);
        const exprStmt = bodyParse.program.body[0];
        let closureNode =
          exprStmt?.type === "ExpressionStatement" ? exprStmt.expression : null;

        while (closureNode?.type === "ParenthesizedExpression") {
          closureNode = closureNode.expression;
        }

        if (
          closureNode &&
          (closureNode.type === "ArrowFunctionExpression" ||
            closureNode.type === "FunctionExpression")
        ) {
          closureNodes.set(extraction.symbolName, closureNode);
          const bodyIds = collectScopeIdentifiers(
            closureNode,
            extraction.bodyText,
            "segment.tsx",
          );
          bodyScopeIds.set(extraction.symbolName, bodyIds);
        }
      } catch {
        // If parsing fails, skip
      }
    }

    // Run capture analysis with the correct parent scope for each extraction.
    for (const extraction of extractions) {
      const closureNode = closureNodes.get(extraction.symbolName);
      if (!closureNode) continue;

      const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;

      let parentScopeIds: Set<string>;
      if (enclosingExt) {
        parentScopeIds = bodyScopeIds.get(enclosingExt.symbolName) ?? new Set();
      } else {
        parentScopeIds = moduleScopeIds;
      }

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
        importedNames,
      );
      extraction.captureNames = result.captureNames;
      extraction.paramNames = result.paramNames;
      extraction.captures = result.captures;

      // Filter out function/class declarations from captures.
      if (extraction.captureNames.length > 0) {
        const classifyScope = enclosingExt
          ? (bodyPrograms.get(enclosingExt.symbolName) ?? program)
          : program;
        extraction.captureNames = extraction.captureNames.filter((name) => {
          const declType = classifyDeclarationType(classifyScope, name);
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
      const constValues = resolveConstLiterals(
        enclosingExt.bodyText,
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
    const extractionLoopMap = buildExtractionLoopMap(program, extractions, repairedCode);
    const allScopeEntries = collectAllScopeEntries(program);

    promoteEventHandlerCaptures(
      extractions,
      closureNodes,
      bodyScopeIds,
      moduleScopeIds,
      importedNames,
      enclosingExtMap,
      extractionLoopMap,
      allScopeEntries,
      program,
      repairedCode,
      globalDeclPositions,
    );

    // Unify parameter slots for multiple event handlers on the same element
    unifyParameterSlots(
      extractions,
      enclosingExtMap,
      extractionLoopMap,
      globalDeclPositions,
      repairedCode,
    );

    // Build elementQpParams map
    const elementQpParamsMap = buildElementQpParamsMap(
      extractions,
      enclosingExtMap,
      extractionLoopMap,
      globalDeclPositions,
      repairedCode,
    );

    detectC02Diagnostics(
      extractions,
      closureNodes,
      enclosingExtMap,
      bodyPrograms,
      importedNames,
      program,
      repairedCode,
      relPath,
      diagnostics,
    );

    // Phase 3: Variable migration analysis
    const moduleLevelDecls = collectModuleLevelDecls(program, repairedCode);
    const moduleLevelDeclsByName = new Map<
      string,
      (typeof moduleLevelDecls)[0]
    >();
    for (const d of moduleLevelDecls) {
      moduleLevelDeclsByName.set(d.name, d);
    }
    const nonInlinedExtractions = extractions.filter((e) => !e.isInlinedQrl);
    const { segmentUsage, rootUsage } = computeSegmentUsage(
      program,
      nonInlinedExtractions,
    );

    // Augment segmentUsage with captureNames from scope-aware capture analysis.
    for (const ext of nonInlinedExtractions) {
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

    const entryStrategy = options.entryStrategy ?? { type: "smart" as const };
    const isInlineStrategy =
      entryStrategy.type === "inline" || entryStrategy.type === "hoist";
    const migrationDecisions = isInlineStrategy
      ? []
      : analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage);

    const parentModulePath = computeParentModulePath(
      relPath,
      options.explicitExtensions,
    );

    // Prod mode: rename symbols to s_{hash}
    const preRenameSymbolName = new Map<string, string>();
    const emitMode = options.mode ?? "prod";
    if (emitMode === "prod") {
      for (const ext of extractions) {
        if (ext.isInlinedQrl) continue;
        const original = ext.symbolName;
        ext.symbolName = "s_" + ext.hash;
        preRenameSymbolName.set(ext.symbolName, original);
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

    // When JSX will be transpiled, downgrade extensions on extraction results
    if (shouldTranspileJsx || shouldTranspileTs) {
      for (const extraction of extractions) {
        if (shouldTranspileJsx) {
          if (extraction.extension === ".tsx")
            extraction.extension = shouldTranspileTs ? ".js" : ".ts";
          else if (extraction.extension === ".jsx")
            extraction.extension = ".js";
          else if (shouldTranspileTs && extraction.extension === ".ts")
            extraction.extension = ".js";
        } else if (shouldTranspileTs) {
          if (extraction.extension === ".ts") extraction.extension = ".js";
          else if (extraction.extension === ".tsx")
            extraction.extension = ".jsx";
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
    );

    // Post-process parent: DCE + unused import cleanup
    let parentCode = applySegmentDCE(parentResult.code);
    const cleanedCode = removeUnusedImports(
      parentCode,
      relPath,
      options.transpileJsx,
    );
    const parentModule: TransformModule = {
      path: relPath,
      isEntry: false,
      code: cleanedCode,
      map: null,
      segment: null,
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

    // Phase 5: Generate segment modules
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
        const constValues = resolveConstLiterals(
          parentExt.bodyText,
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
      extractions,
      updatedExtractions,
      program,
      originalImports,
      options,
      repairedCode,
      relPath,
      emitMode,
      devFile,
      isInlineStrategy,
      entryStrategy,
      migrationDecisions,
      moduleLevelDecls,
      moduleLevelDeclsByName,
      segmentUsage,
      parentModulePath,
      preRenameSymbolName,
      qrlOutputExt,
      sourceExtensions,
      shouldTranspileJsx,
      shouldTranspileTs,
      isJsx,
      importedNames,
      enclosingExtMap,
      elementQpParamsMap,
      extractionLoopMap,
      constLiteralsMap,
      parentJsxKeyCounterValue: parentResult.jsxKeyCounterValue ?? 0,
    };

    const segmentModules = generateAllSegmentModules(segmentCtx);
    allModules.push(...segmentModules);
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
