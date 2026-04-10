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
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import MagicString from 'magic-string';
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

// Phase 6: Diagnostics
import {
  emitC02,
  emitC05,
  emitPreventdefaultPassiveCheck,
  classifyDeclarationType,
  parseDisableDirectives,
  filterSuppressedDiagnostics,
} from './diagnostics.js';

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
// Import cleanup
// ---------------------------------------------------------------------------

/**
 * Qwik package prefixes whose imports should never be removed.
 * These may have been added by the rewriter and are always needed.
 */
const QWIK_IMPORT_PREFIXES = [
  '@qwik.dev/',
  '@builder.io/qwik',
];

/**
 * Remove unused non-Qwik imports from a rewritten parent module.
 *
 * After extraction moves closures into segments, some imports in the parent
 * module may no longer be referenced. This function re-parses the rewritten
 * code, identifies which import specifiers are unreferenced in the remaining
 * body, and removes them.
 *
 * Safety rules:
 * - Never removes Qwik imports (they may have been added by the rewriter)
 * - Never removes side-effect imports (`import 'module'` with no specifiers)
 * - Never removes namespace imports (`import * as ns from '...'`)
 * - Only removes named specifiers whose local name has zero references outside imports
 *
 * @param code - The rewritten parent module source code
 * @param filename - Filename for parser (determines language)
 * @returns Cleaned code with unused imports removed
 */
function removeUnusedImports(code: string, filename: string): string {
  let parsed;
  try {
    parsed = parseSync(filename, code);
  } catch {
    // If parsing fails, return code unchanged
    return code;
  }

  const program = parsed.program;

  // 1. Collect all import declarations and their specifiers
  interface ImportSpec {
    localName: string;
    node: any; // The ImportDeclaration node
    specIndex: number;
    specNode: any;
  }

  const importSpecs: ImportSpec[] = [];
  const importNodes: any[] = [];

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    // Skip side-effect imports (no specifiers)
    if (!node.specifiers || node.specifiers.length === 0) continue;

    // Skip Qwik imports
    const source = node.source?.value ?? '';
    if (QWIK_IMPORT_PREFIXES.some((prefix) => source.startsWith(prefix))) continue;

    importNodes.push(node);

    for (let i = 0; i < node.specifiers.length; i++) {
      const spec = node.specifiers[i];
      // Skip namespace imports -- they could be referenced via property access
      if (spec.type === 'ImportNamespaceSpecifier') continue;

      const localName = spec.local?.name;
      if (localName) {
        importSpecs.push({ localName, node, specIndex: i, specNode: spec });
      }
    }
  }

  if (importSpecs.length === 0) return code;

  // 2. Collect all Identifier references in the non-import part of the AST
  const referencedNames = new Set<string>();
  walk(program, {
    enter(node: any, parent: any) {
      // Skip import declaration subtrees (use this.skip() to prevent walking children)
      if (node.type === 'ImportDeclaration') {
        this.skip();
        return;
      }

      if (node.type === 'Identifier' && node.name) {
        // Skip property keys in non-shorthand object properties
        if (
          parent?.type === 'Property' &&
          parent.key === node &&
          !parent.shorthand &&
          !parent.computed
        ) {
          return;
        }
        // Skip member expression property names (obj.prop -- skip prop)
        if (
          parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        ) {
          return;
        }
        referencedNames.add(node.name);
      }
    },
  });

  // 3. Find unreferenced import specifiers
  const unreferencedSpecs = importSpecs.filter(
    (spec) => !referencedNames.has(spec.localName),
  );

  if (unreferencedSpecs.length === 0) return code;

  // 4. Remove unreferenced imports using magic-string
  const ms = new MagicString(code);

  // Group unreferenced specs by their parent import node
  const specsByNode = new Map<any, ImportSpec[]>();
  for (const spec of unreferencedSpecs) {
    const existing = specsByNode.get(spec.node) ?? [];
    existing.push(spec);
    specsByNode.set(spec.node, existing);
  }

  for (const [node, specs] of specsByNode) {
    const totalSpecs = node.specifiers?.length ?? 0;
    const unreferencedCount = specs.length;
    // Count how many specifiers in this import are namespace (which we never remove)
    const namespaceCount = (node.specifiers ?? []).filter(
      (s: any) => s.type === 'ImportNamespaceSpecifier',
    ).length;
    const removableTotal = totalSpecs - namespaceCount;

    if (unreferencedCount >= removableTotal && namespaceCount === 0) {
      // All specifiers are unreferenced: remove entire import declaration
      let end = node.end;
      if (end < code.length && code[end] === '\n') end++;
      ms.overwrite(node.start, end, '');
    } else {
      // Only some specifiers are unreferenced: rebuild the import
      const unreferencedNames = new Set(specs.map((s) => s.localName));
      const keptParts: string[] = [];
      let defaultPart = '';
      let nsPart = '';

      for (const spec of node.specifiers ?? []) {
        const localName = spec.local?.name;
        if (unreferencedNames.has(localName)) continue;

        if (spec.type === 'ImportDefaultSpecifier') {
          defaultPart = localName;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          nsPart = `* as ${localName}`;
        } else {
          const importedName = spec.imported?.name ?? localName;
          if (importedName !== localName) {
            keptParts.push(`${importedName} as ${localName}`);
          } else {
            keptParts.push(localName);
          }
        }
      }

      let importParts = '';
      if (nsPart) {
        importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
      } else if (keptParts.length > 0) {
        importParts = defaultPart
          ? `${defaultPart}, { ${keptParts.join(', ')} }`
          : `{ ${keptParts.join(', ')} }`;
      } else if (defaultPart) {
        importParts = defaultPart;
      }

      const sourceValue = node.source?.value ?? '';
      const quote = code[node.source.start] === "'" ? "'" : '"';
      const newImport = `import ${importParts} from ${quote}${sourceValue}${quote};`;
      let end = node.end;
      if (end < code.length && code[end] === '\n') end++;
      ms.overwrite(node.start, end, newImport + '\n');
    }
  }

  return ms.toString();
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

    // 2a-diag. Diagnostic detection: C02 (function/class references crossing $() boundary)
    // C02 fires when a function or class declaration from the enclosing scope is
    // REFERENCED inside a $() closure -- even if it's not a formal capture (fn/class
    // can't be serialized, so they don't appear in captureNames).
    // We parse each extraction's body independently and get undeclared identifiers,
    // then classify each against the enclosing scope.
    for (const extraction of extractions) {
      // Parse this extraction's body to get undeclared identifiers
      let undeclaredIds: string[];
      try {
        const wrappedBody = `(${extraction.bodyText})`;
        const bodyParse = parseSync('segment.tsx', wrappedBody);
        const exprStmt = bodyParse.program.body[0];
        let closureNode = exprStmt?.type === 'ExpressionStatement' ? exprStmt.expression : null;
        while (closureNode?.type === 'ParenthesizedExpression') {
          closureNode = closureNode.expression;
        }
        if (!closureNode || (closureNode.type !== 'ArrowFunctionExpression' && closureNode.type !== 'FunctionExpression')) {
          continue;
        }
        undeclaredIds = getUndeclaredIdentifiersInFunction(closureNode);
      } catch {
        continue;
      }
      if (undeclaredIds.length === 0) continue;

      // Find enclosing extraction using range containment (not symbolName)
      let enclosingExt: typeof extractions[0] | null = null;
      for (const other of extractions) {
        if (other === extraction) continue;
        if (extraction.callStart >= other.argStart && extraction.callEnd <= other.argEnd) {
          if (!enclosingExt || (other.argStart >= enclosingExt.argStart && other.argEnd <= enclosingExt.argEnd)) {
            enclosingExt = other;
          }
        }
      }

      // Classify each undeclared identifier against enclosing scope
      // Skip imports and known globals
      for (const refName of undeclaredIds) {
        if (importedNames.has(refName)) continue;

        // Classify in the enclosing scope
        let declType: 'var' | 'fn' | 'class';
        if (enclosingExt) {
          try {
            const wrappedBody = `(${enclosingExt.bodyText})`;
            const bodyParse = parseSync('segment.tsx', wrappedBody);
            declType = classifyDeclarationType(bodyParse.program, refName);
          } catch {
            declType = 'var';
          }
        } else {
          declType = classifyDeclarationType(program, refName);
        }

        if (declType === 'fn' || declType === 'class') {
          diagnostics.push(emitC02(refName, relPath, declType === 'class'));
        }
      }
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
      options.explicitExtensions,
    );

    // 3b. Import cleanup: remove non-Qwik imports whose identifiers are no longer
    // referenced in the parent module after extraction moved their consumers to segments.
    const cleanedCode = removeUnusedImports(parentResult.code, relPath);

    // 4. Build parent TransformModule
    const parentModule: TransformModule = {
      path: relPath,
      isEntry: false,
      code: cleanedCode,
      map: null, // Source maps deferred
      segment: null,
      origPath: input.path,
    };
    allModules.push(parentModule);

    // 4a-diag. C05 detection: custom $-suffixed exports missing Qrl counterpart
    // Collect all exported names from the module
    const moduleExportNames = new Set<string>();
    for (const stmt of program.body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.declaration?.type === 'VariableDeclaration') {
          for (const decl of stmt.declaration.declarations ?? []) {
            if (decl.id?.type === 'Identifier') {
              moduleExportNames.add(decl.id.name);
            }
          }
        }
        if (stmt.declaration?.type === 'FunctionDeclaration' && stmt.declaration.id) {
          moduleExportNames.add(stmt.declaration.id.name);
        }
        if (stmt.declaration?.type === 'ClassDeclaration' && stmt.declaration.id) {
          moduleExportNames.add(stmt.declaration.id.name);
        }
        // Named export specifiers
        for (const spec of stmt.specifiers ?? []) {
          const exported = spec.exported;
          const exportedName = exported?.type === 'Identifier' ? exported.name : (exported as any)?.value;
          if (exportedName) {
            moduleExportNames.add(exportedName);
          }
        }
      }
    }

    // Check each exported $-suffixed name for a corresponding Qrl export
    for (const exportName of moduleExportNames) {
      if (!exportName.endsWith('$')) continue;

      // Skip known Qwik core functions (they don't need Qrl exports)
      const importInfo = originalImports.get(exportName);
      if (importInfo?.isQwikCore) continue;

      // Derive expected Qrl name
      const qrlName = exportName.slice(0, -1) + 'Qrl';
      if (!moduleExportNames.has(qrlName)) {
        // Find call sites of this function in the source for highlight spans
        // Scan extractions for usages, or find call expressions in the AST
        const callSites = findCallSites(program, exportName);
        for (const site of callSites) {
          const [startLine, startCol] = computeLineColFromOffset(input.code, site.start);
          const [endLine, endCol] = computeLineColFromOffset(input.code, site.end);
          diagnostics.push(emitC05(exportName, qrlName, relPath, {
            lo: site.start,
            hi: site.end,
            startLine,
            startCol,
            endLine,
            endCol,
          }));
        }
      }
    }

    // 4b-diag. preventdefault-passive-check: detect contradictory passive + preventdefault
    if (ext === '.tsx' || ext === '.jsx') {
      detectPassivePreventdefaultConflicts(program, relPath, input.code, diagnostics);
    }

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
          'manual' in entryStrategy ? (entryStrategy as any).manual as Record<string, string> | undefined : undefined,
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
        buildQrlDeclaration(child.symbolName, child.canonicalFilename, options.explicitExtensions),
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
        'manual' in entryStrategy ? (entryStrategy as any).manual as Record<string, string> | undefined : undefined,
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

  // 6. Apply @qwik-disable-next-line suppression to all diagnostics
  // Parse directives from all input files and filter diagnostics
  let filteredDiagnostics = diagnostics;
  for (const input of options.input) {
    const directives = parseDisableDirectives(input.code);
    if (directives.size > 0) {
      filteredDiagnostics = filterSuppressedDiagnostics(filteredDiagnostics, directives);
    }
  }

  return {
    modules: allModules,
    diagnostics: filteredDiagnostics,
    isTypeScript,
    isJsx,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic helper functions
// ---------------------------------------------------------------------------

/**
 * Find all call sites of a named function in an AST.
 * Returns array of { start, end } positions for the callee identifier.
 */
function findCallSites(program: any, funcName: string): Array<{ start: number; end: number }> {
  const sites: Array<{ start: number; end: number }> = [];
  walk(program, {
    enter(node: any) {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === funcName
      ) {
        sites.push({ start: node.callee.start, end: node.callee.end });
      }
    },
  });
  return sites;
}

/**
 * Compute 1-based line and column from a character offset in source text.
 */
function computeLineColFromOffset(source: string, offset: number): [number, number] {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return [line, col];
}

/**
 * Detect preventdefault + passive conflicts on JSX elements.
 * Walks the AST looking for JSXOpeningElement nodes that have both
 * passive:EVENT and preventdefault:EVENT attributes.
 */
function detectPassivePreventdefaultConflicts(
  program: any,
  file: string,
  source: string,
  diagnostics: import('./types.js').Diagnostic[],
): void {
  walk(program, {
    enter(node: any) {
      if (node.type !== 'JSXOpeningElement') return;

      const attrs = node.attributes ?? [];
      const passiveEvents = new Set<string>();
      const preventdefaultEvents = new Set<string>();

      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute') continue;

        let name: string | null = null;
        if (attr.name?.type === 'JSXIdentifier') {
          name = attr.name.name;
        } else if (attr.name?.type === 'JSXNamespacedName') {
          name = `${attr.name.namespace.name}:${attr.name.name.name}`;
        }
        if (!name) continue;

        if (name.startsWith('passive:')) {
          passiveEvents.add(name.slice('passive:'.length));
        } else if (name.startsWith('preventdefault:')) {
          preventdefaultEvents.add(name.slice('preventdefault:'.length));
        }
      }

      // Check for conflicts
      for (const eventName of passiveEvents) {
        if (preventdefaultEvents.has(eventName)) {
          // Build highlight span for the JSX element
          const [startLine, startCol] = computeLineColFromOffset(source, node.start);
          // Find the closing > of the opening element
          const parent = node.parent;
          const elementEnd = node.end;
          const [endLine, endCol] = computeLineColFromOffset(source, elementEnd);

          diagnostics.push(emitPreventdefaultPassiveCheck(eventName, file, {
            lo: node.start,
            hi: elementEnd,
            startLine,
            startCol,
            endLine,
            endCol,
          }));
        }
      }
    },
  });
}
