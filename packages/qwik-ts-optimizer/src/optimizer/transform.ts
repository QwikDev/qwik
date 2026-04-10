/**
 * Public entry point for the Qwik optimizer.
 *
 * transformModule() accepts TransformModulesOptions and returns TransformOutput,
 * wiring together extraction, capture analysis, variable migration, parent
 * rewriting, and segment codegen into a single public API matching the NAPI
 * binding interface.
 *
 * Implements: API-01, API-02, CAPT-02, CAPT-03
 */

import { parseSync } from 'oxc-parser';
import { extractSegments } from './extract.js';
import { rewriteParentModule } from './rewrite-parent.js';
import { generateSegmentCode, type SegmentCaptureInfo } from './segment-codegen.js';
import { collectImports, type ImportInfo } from './marker-detection.js';
import { buildQrlDeclaration } from './rewrite-calls.js';
import { resolveEntryField } from './entry-strategy.js';
import { buildQrlDevDeclaration, buildDevFilePath, buildJsxSourceInfo } from './dev-mode.js';
import { isStrippedSegment, generateStrippedSegmentCode } from './strip-ctx.js';
import { analyzeCaptures, collectScopeIdentifiers } from './capture-analysis.js';
import {
  analyzeMigration,
  collectModuleLevelDecls,
  computeSegmentUsage,
  type MigrationDecision,
} from './variable-migration.js';
import type {
  TransformModulesOptions,
  TransformOutput,
  TransformModule,
  SegmentAnalysis,
  SegmentMetadataInternal,
} from './types.js';

// Phase 4: JSX transform modules
import { transformAllJsx, type JsxTransformOutput } from './jsx-transform.js';
import { analyzeSignalExpression, SignalHoister } from './signal-analysis.js';
import { transformEventPropName, isEventProp, collectPassiveDirectives } from './event-handler-transform.js';
import { transformBindProp, isBindProp } from './bind-transform.js';
import { detectLoopContext, findEnclosingLoop, analyzeLoopHandler } from './loop-hoisting.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine file extension from a path string.
 */
function getExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx >= 0) return filePath.slice(dotIdx);
  return '';
}

/**
 * Normalize a path to use forward slashes.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
function computeRelPath(inputPath: string, srcDir: string): string {
  const normInput = normalizePath(inputPath);
  const normSrc = normalizePath(srcDir);

  // If srcDir is "." or empty, just use the input path directly
  if (normSrc === '.' || normSrc === '' || normSrc === './') {
    return normInput;
  }

  // Strip leading srcDir prefix
  const prefix = normSrc.endsWith('/') ? normSrc : normSrc + '/';
  if (normInput.startsWith(prefix)) {
    return normInput.slice(prefix.length);
  }

  return normInput;
}

/**
 * Strip file extension from a path.
 * e.g., "./test.tsx" -> "./test"
 */
function stripExtension(filePath: string): string {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx >= 0) return filePath.slice(0, dotIdx);
  return filePath;
}

/**
 * Compute the parent module path for _auto_ imports.
 * This is the relative path without extension, prefixed with "./" if needed.
 */
function computeParentModulePath(relPath: string): string {
  const stripped = stripExtension(relPath);
  if (stripped.startsWith('./') || stripped.startsWith('../')) return stripped;
  return './' + stripped;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Transform Qwik source modules by extracting segments, rewriting the parent
 * module, and generating segment module code.
 *
 * This is the public API consumed by the Qwik Vite plugin, matching the NAPI
 * binding interface.
 *
 * @param options - Transform options including input files and configuration
 * @returns TransformOutput with parent and segment modules, diagnostics, and flags
 */
export function transformModule(options: TransformModulesOptions): TransformOutput {
  const allModules: TransformModule[] = [];
  const diagnostics: import('./types.js').Diagnostic[] = [];
  let isTypeScript = false;
  let isJsx = false;

  for (const input of options.input) {
    const relPath = computeRelPath(input.path, options.srcDir);
    const ext = getExtension(relPath);

    // Detect language flags
    if (ext === '.ts' || ext === '.tsx') isTypeScript = true;
    if (ext === '.tsx' || ext === '.jsx') isJsx = true;

    // 1. Extract segments
    const extractions = extractSegments(input.code, relPath, options.scope);

    // 2. Collect imports for parent rewriting (need to re-parse for the import map)
    const { program } = parseSync(relPath, input.code);
    const originalImports = collectImports(program);

    // Build importedNames set for capture analysis (excludes from captures)
    const importedNames = new Set<string>();
    for (const [localName] of originalImports) {
      importedNames.add(localName);
    }

    // 2a. Run capture analysis for each extraction
    // First, collect module-level scope identifiers for top-level capture analysis
    const moduleScopeIds = collectScopeIdentifiers(program, input.code, relPath);

    // Pre-parse each extraction's body to get closure AST nodes, and collect
    // scope identifiers from each body (needed for nested capture analysis)
    const closureNodes = new Map<string, any>(); // symbolName -> closureNode
    const bodyScopeIds = new Map<string, Set<string>>(); // symbolName -> scope ids from body

    for (const extraction of extractions) {
      try {
        const wrappedBody = `(${extraction.bodyText})`;
        const bodyParse = parseSync('segment.tsx', wrappedBody);
        const exprStmt = bodyParse.program.body[0];
        let closureNode =
          exprStmt?.type === 'ExpressionStatement' ? exprStmt.expression : null;

        // Unwrap ParenthesizedExpression (from the wrapping parentheses)
        while (closureNode?.type === 'ParenthesizedExpression') {
          closureNode = closureNode.expression;
        }

        if (closureNode && (closureNode.type === 'ArrowFunctionExpression' || closureNode.type === 'FunctionExpression')) {
          closureNodes.set(extraction.symbolName, closureNode);
          // Collect scope identifiers from this closure's body (for nested captures)
          const bodyIds = collectScopeIdentifiers(closureNode, extraction.bodyText, 'segment.tsx');
          bodyScopeIds.set(extraction.symbolName, bodyIds);
        }
      } catch {
        // If parsing fails, skip
      }
    }

    // Now run capture analysis with the correct parent scope for each extraction.
    // Nesting is determined later (Step 3 in rewriteParentModule), but we can
    // detect it here using range containment to find the enclosing extraction.
    for (const extraction of extractions) {
      const closureNode = closureNodes.get(extraction.symbolName);
      if (!closureNode) continue;

      // Find enclosing extraction (if nested) using range containment
      let enclosingExt: typeof extractions[0] | null = null;
      for (const other of extractions) {
        if (other.symbolName === extraction.symbolName) continue;
        if (extraction.callStart >= other.argStart && extraction.callEnd <= other.argEnd) {
          // Pick the tightest enclosing extraction
          if (!enclosingExt || (other.argStart >= enclosingExt.argStart && other.argEnd <= enclosingExt.argEnd)) {
            enclosingExt = other;
          }
        }
      }

      // Build parent scope identifiers
      let parentScopeIds: Set<string>;
      if (enclosingExt) {
        // Nested: parent scope is the enclosing extraction's body scope
        parentScopeIds = bodyScopeIds.get(enclosingExt.symbolName) ?? new Set();
      } else {
        // Top-level: parent scope is module-level identifiers
        parentScopeIds = moduleScopeIds;
      }

      const result = analyzeCaptures(closureNode, parentScopeIds, importedNames);
      extraction.captureNames = result.captureNames;
      extraction.paramNames = result.paramNames;
      extraction.captures = result.captures;
    }

    // 2b. Run variable migration analysis
    const moduleLevelDecls = collectModuleLevelDecls(program, input.code);
    const { segmentUsage, rootUsage } = computeSegmentUsage(program, extractions);
    const migrationDecisions = analyzeMigration(moduleLevelDecls, segmentUsage, rootUsage);

    // Compute parent module path for _auto_ imports (no extension)
    const parentModulePath = computeParentModulePath(relPath);

    // 3. Rewrite parent module (pass migration decisions + JSX options + mode)
    const emitMode = options.mode ?? 'prod';
    const devFile = emitMode === 'dev'
      ? buildDevFilePath(input.path, options.srcDir, input.devPath)
      : undefined;

    const entryStrategy = options.entryStrategy ?? { type: 'smart' as const };
    const isInlineStrategy = entryStrategy.type === 'inline' || entryStrategy.type === 'hoist';

    const parentResult = rewriteParentModule(
      input.code,
      relPath,
      extractions,
      originalImports,
      migrationDecisions,
      moduleLevelDecls,
      (ext === '.tsx' || ext === '.jsx')
        ? { enableJsx: true, importedNames }
        : undefined,
      emitMode,
      devFile,
      isInlineStrategy
        ? { inline: true, stripCtxName: options.stripCtxName, stripEventHandlers: options.stripEventHandlers }
        : options.stripCtxName || options.stripEventHandlers
          ? { inline: false, stripCtxName: options.stripCtxName, stripEventHandlers: options.stripEventHandlers }
          : undefined,
      options.stripExports,
      options.isServer,
    );

    // 4. Build parent TransformModule
    const parentModule: TransformModule = {
      path: relPath,
      isEntry: false,
      code: parentResult.code,
      map: null, // Source maps deferred
      segment: null,
      origPath: input.path,
    };
    allModules.push(parentModule);

    // 5. Generate segment modules for non-sync extractions
    // Updated extractions have parent info from rewriteParentModule
    const updatedExtractions = parentResult.extractions;

    // For inline/hoist strategy, segments are inlined into parent -- no separate segment modules.
    // But we still emit SegmentAnalysis metadata entries.
    // For stripped segments, emit null exports with loc [0,0].

    for (const ext of updatedExtractions) {
      if (ext.isSync) continue; // sync$ is inlined, no separate segment module

      // Check if this segment is stripped
      const stripped = isStrippedSegment(
        ext.ctxName,
        ext.ctxKind,
        options.stripCtxName,
        options.stripEventHandlers,
      );

      // If stripped, override loc to [0, 0]
      if (stripped) {
        ext.loc = [0, 0];
      }

      // For inline/hoist strategy, do NOT emit separate segment TransformModules.
      // The parent module already contains everything via _noopQrl + .s() calls.
      // But still emit SegmentAnalysis metadata (as segment modules with no code output).
      if (isInlineStrategy) {
        // Build metadata only -- no separate segment file
        const entryField = resolveEntryField(
          entryStrategy.type,
          ext.symbolName,
          ext.ctxName,
          null,
          'manual' in entryStrategy ? entryStrategy.manual : undefined,
        );

        const segmentAnalysis: SegmentMetadataInternal = {
          origin: ext.origin,
          name: ext.symbolName,
          entry: entryField,
          displayName: ext.displayName,
          hash: ext.hash,
          canonicalFilename: ext.canonicalFilename,
          extension: ext.extension,
          parent: ext.parent,
          ctxKind: ext.ctxKind,
          ctxName: ext.ctxName,
          captures: ext.captures,
          loc: ext.loc,
          captureNames: ext.captureNames,
          paramNames: ext.paramNames,
        };

        // Inline strategy still creates TransformModule entries for metadata tracking
        // but with empty code (the code is in the parent)
        const segmentModule: TransformModule = {
          path: ext.canonicalFilename + ext.extension,
          isEntry: true,
          code: stripped ? generateStrippedSegmentCode(ext.symbolName) : '',
          map: null,
          segment: segmentAnalysis,
          origPath: null,
        };
        allModules.push(segmentModule);
        continue;
      }

      // Default strategy: emit separate segment modules

      // Determine nested QRL declarations for segments that have children
      const children = updatedExtractions.filter((c) => c.parent === ext.symbolName && !c.isSync);
      const nestedQrlDecls = children.map((child) =>
        buildQrlDeclaration(child.symbolName, child.canonicalFilename),
      );

      // 2c. Build SegmentCaptureInfo for this extraction
      const captureInfo: SegmentCaptureInfo = {
        captureNames: ext.captureNames,
        autoImports: [],
        movedDeclarations: [],
      };

      // For top-level segments (no parent): wire migration info
      if (ext.parent === null) {
        // _auto_ imports: from migration decisions where action is "reexport" and the variable is used by this segment
        const segUsage = segmentUsage.get(ext.symbolName);
        if (segUsage) {
          for (const decision of migrationDecisions) {
            if (decision.action === 'reexport' && segUsage.has(decision.varName)) {
              captureInfo.autoImports.push({
                varName: decision.varName,
                parentModulePath,
              });
            }
          }
        }

        // Moved declarations: from migration decisions where action is "move" and targetSegment matches
        for (const decision of migrationDecisions) {
          if (decision.action === 'move' && decision.targetSegment === ext.symbolName) {
            const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
            if (decl) {
              captureInfo.movedDeclarations.push(decl.declText);
            }
          }
        }

        // Top-level segments: variables handled by migration (_auto_ imports or moves)
        // should NOT appear as captures. Filter them out from captureNames and update
        // the captures flag. Only scope-level captures use _captures mechanism.
        const migratedVarNames = new Set<string>();
        for (const decision of migrationDecisions) {
          if (decision.action === 'reexport' || decision.action === 'move') {
            migratedVarNames.add(decision.varName);
          }
        }
        // Remove migrated vars from capture names
        ext.captureNames = ext.captureNames.filter((name) => !migratedVarNames.has(name));
        ext.captures = ext.captureNames.length > 0;
        // For codegen: only use _captures for remaining scope-level captures
        captureInfo.captureNames = ext.captureNames;
      }

      // Generate segment code: stripped segments get null exports, others get full codegen
      const segmentCode = stripped
        ? generateStrippedSegmentCode(ext.symbolName)
        : generateSegmentCode(
            ext,
            nestedQrlDecls.length > 0 ? nestedQrlDecls : undefined,
            (captureInfo.captureNames.length > 0 || captureInfo.autoImports.length > 0 || captureInfo.movedDeclarations.length > 0)
              ? captureInfo
              : undefined,
            (ext.extension === '.tsx' || ext.extension === '.jsx' || isJsx)
              ? { enableJsx: true, importedNames }
              : undefined,
          );

      // 2d. Build segment metadata with captureNames and paramNames
      // Find parent component symbol for component entry strategy
      let parentComponentSymbol: string | null = null;
      if (entryStrategy.type === 'component') {
        // Walk up parent chain to find nearest component extraction
        let current = ext.parent;
        while (current) {
          const parentExt = updatedExtractions.find((e) => e.symbolName === current);
          if (parentExt && parentExt.ctxName === 'component') {
            parentComponentSymbol = parentExt.symbolName;
            break;
          }
          current = parentExt?.parent ?? null;
        }
      }
      const entryField = resolveEntryField(
        entryStrategy.type,
        ext.symbolName,
        ext.ctxName,
        parentComponentSymbol,
        'manual' in entryStrategy ? entryStrategy.manual : undefined,
      );

      const segmentAnalysis: SegmentMetadataInternal = {
        origin: ext.origin,
        name: ext.symbolName,
        entry: entryField,
        displayName: ext.displayName,
        hash: ext.hash,
        canonicalFilename: ext.canonicalFilename,
        extension: ext.extension,
        parent: ext.parent,
        ctxKind: ext.ctxKind,
        ctxName: ext.ctxName,
        captures: ext.captures,
        loc: ext.loc,
        captureNames: ext.captureNames,
        paramNames: ext.paramNames,
      };

      const segmentModule: TransformModule = {
        path: ext.canonicalFilename + ext.extension,
        isEntry: true,
        code: segmentCode,
        map: null,
        segment: segmentAnalysis,
        origPath: null,
      };
      allModules.push(segmentModule);
    }
  }

  return {
    modules: allModules,
    diagnostics,
    isTypeScript,
    isJsx,
  };
}
