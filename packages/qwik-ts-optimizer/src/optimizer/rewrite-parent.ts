/**
 * Parent module rewriting engine for the Qwik optimizer.
 *
 * Uses magic-string to surgically edit the original source text at
 * AST-provided positions, replacing $() calls with QRL references,
 * managing imports, and assembling the final parent module output.
 *
 * Output structure:
 *   [optimizer-added imports]
 *   [original non-marker imports]
 *   //
 *   [QRL const declarations]
 *   //
 *   [rewritten module body]
 *   [_auto_ exports if any]
 *
 * Implements: EXTRACT-03, EXTRACT-05, EXTRACT-06, IMP-04, IMP-06, CAPT-03
 */

import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import type { ExtractionResult } from './extract.js';
import type { ImportInfo } from './marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from './variable-migration.js';
import { rewriteImportSource } from './rewrite-imports.js';
import {
  buildQrlDeclaration,
  buildSyncTransform,
  needsPureAnnotation,
  getQrlImportSource,
} from './rewrite-calls.js';
import { buildQrlDevDeclaration } from './dev-mode.js';
import {
  buildNoopQrlDeclaration,
  buildNoopQrlDevDeclaration,
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  buildSCall,
} from './inline-strategy.js';
import { isStrippedSegment } from './strip-ctx.js';
import { transformAllJsx, type JsxTransformOutput } from './jsx-transform.js';
import type { EmitMode } from './types.js';

// ---------------------------------------------------------------------------
// Inline strategy options
// ---------------------------------------------------------------------------

export interface InlineStrategyOptions {
  /** Whether to use inline/hoist strategy (_noopQrl + .s()) */
  inline: boolean;
  /** Strip context names (server/client strip) */
  stripCtxName?: string[];
  /** Strip event handlers */
  stripEventHandlers?: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParentRewriteResult {
  /** Rewritten parent module source code. */
  code: string;
  /** All extractions (possibly with nested parent refs). */
  extractions: ExtractionResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine which import specifiers in an import declaration are markers
 * that should be removed (they're replaced by Qrl variants).
 */
function isMarkerSpecifier(
  importedName: string,
  extractedCalleeNames: Set<string>,
): boolean {
  return extractedCalleeNames.has(importedName);
}

/**
 * Check if an extraction is for a custom inlined function (not imported from qwik core).
 * Custom inlined functions have their Qrl variant defined locally, so we don't add an import.
 */
function isCustomInlined(
  ext: ExtractionResult,
  originalImports: Map<string, ImportInfo>,
): boolean {
  // ext.calleeName is the canonical (imported) name, but originalImports is keyed by local name.
  // Search by importedName to handle aliases (e.g., `import { component$ as c$ }`).
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) {
      return !info.isQwikCore;
    }
  }
  // Not found in imports at all — must be custom inlined
  return true;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Options for JSX transformation during parent rewriting.
 */
export interface JsxRewriteOptions {
  /** Whether to run JSX transform (true for .tsx/.jsx files) */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
}

/**
 * Rewrite a parent module source using magic-string.
 *
 * @param source - Original source code text
 * @param relPath - Relative file path
 * @param extractions - Extraction results from extractSegments()
 * @param originalImports - Import map from collectImports()
 * @param migrationDecisions - Optional migration decisions from analyzeMigration()
 * @param moduleLevelDecls - Optional module-level declarations for removal of moved vars
 * @param jsxOptions - Optional JSX transform options
 * @returns Rewritten parent module code and updated extractions
 */
export function rewriteParentModule(
  source: string,
  relPath: string,
  extractions: ExtractionResult[],
  originalImports: Map<string, ImportInfo>,
  migrationDecisions?: MigrationDecision[],
  moduleLevelDecls?: ModuleLevelDecl[],
  jsxOptions?: JsxRewriteOptions,
  mode?: EmitMode,
  devFilePath?: string,
  inlineOptions?: InlineStrategyOptions,
): ParentRewriteResult {
  const s = new MagicString(source);
  const { program } = parseSync(relPath, source);

  // Collect all callee names that were extracted (for removing $ imports)
  const extractedCalleeNames = new Set<string>();
  for (const ext of extractions) {
    extractedCalleeNames.add(ext.calleeName);
  }

  // Track which symbols are already imported (for dedup - IMP-06)
  const alreadyImported = new Set<string>();
  for (const [localName] of originalImports) {
    alreadyImported.add(localName);
  }

  // -----------------------------------------------------------------------
  // Step 1: Rewrite existing import sources (IMP-01..03)
  // -----------------------------------------------------------------------
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const sourceNode = node.source;
    const originalSource = sourceNode.value;
    const newSource = rewriteImportSource(originalSource);

    if (newSource !== originalSource) {
      // Overwrite just inside the quotes
      s.overwrite(sourceNode.start + 1, sourceNode.end - 1, newSource);
    }
  }

  // -----------------------------------------------------------------------
  // Step 2: Remove marker specifiers from existing import statements
  // -----------------------------------------------------------------------
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    if (!specifiers || specifiers.length === 0) continue;

    // Find which specifiers are markers to remove
    const toRemove: number[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      const spec = specifiers[i];
      if (spec.type !== 'ImportSpecifier') continue;
      const importedName = (spec as any).imported?.name ?? spec.local.name;
      if (isMarkerSpecifier(importedName, extractedCalleeNames)) {
        toRemove.push(i);
      }
    }

    if (toRemove.length === 0) continue;

    if (toRemove.length === specifiers.length) {
      // All specifiers are markers: remove the entire import statement
      // Include the trailing newline if present
      let end = node.end;
      if (end < source.length && source[end] === '\n') end++;
      s.overwrite(node.start, end, '');
    } else {
      // Remove only the marker specifiers
      // Rebuild the specifier list keeping non-markers, handling all import forms
      let defaultPart = '';
      let nsPart = '';
      const namedParts: string[] = [];
      for (let i = 0; i < specifiers.length; i++) {
        if (toRemove.includes(i)) continue;
        const spec = specifiers[i];
        if (spec.type === 'ImportDefaultSpecifier') {
          defaultPart = spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          nsPart = `* as ${spec.local.name}`;
        } else {
          const localName = spec.local.name;
          const importedName = (spec as any).imported?.name ?? localName;
          if (importedName !== localName) {
            namedParts.push(`${importedName} as ${localName}`);
          } else {
            namedParts.push(localName);
          }
        }
      }
      // Rebuild import with correct syntax for each form
      const sourceNode = node.source;
      const rewrittenSource = rewriteImportSource(sourceNode.value);
      let importParts = '';
      if (nsPart) {
        importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
      } else if (namedParts.length > 0) {
        importParts = defaultPart
          ? `${defaultPart}, { ${namedParts.join(', ')} }`
          : `{ ${namedParts.join(', ')} }`;
      } else if (defaultPart) {
        importParts = defaultPart;
      }
      const newImport = `import ${importParts} from "${rewrittenSource}";`;
      let end = node.end;
      if (end < source.length && source[end] === '\n') end++;
      s.overwrite(node.start, end, newImport + '\n');
    }
  }

  // -----------------------------------------------------------------------
  // Step 3: Determine nesting (parent-child relationships)
  // -----------------------------------------------------------------------
  // Sort by callStart ascending to detect containment
  const sorted = [...extractions].sort((a, b) => a.callStart - b.callStart);

  // Mark nested extractions: an extraction is nested if its call range
  // is fully contained within another extraction's argument range.
  // Also set the parent field for nested extractions.
  for (let i = 0; i < sorted.length; i++) {
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      // Check if sorted[i] is inside sorted[j]'s argument
      if (
        sorted[i].callStart >= sorted[j].argStart &&
        sorted[i].callEnd <= sorted[j].argEnd
      ) {
        sorted[i].parent = sorted[j].symbolName;
        break;
      }
    }
  }

  // Update the extractions array with parent info
  for (const ext of sorted) {
    const orig = extractions.find((e) => e.symbolName === ext.symbolName);
    if (orig) orig.parent = ext.parent;
  }

  // Top-level extractions: those with no parent
  const topLevel = extractions.filter((e) => e.parent === null);

  // -----------------------------------------------------------------------
  // Step 3b: Pre-compute QRL variable names for stripped segments
  // -----------------------------------------------------------------------
  // When strip options are active, stripped segments use sentinel-named variables
  // (q_qrl_{counter}) instead of q_{symbolName}. We compute this map early so
  // call site rewriting uses the correct variable names.
  const earlyQrlVarNames = new Map<string, string>();
  let earlyStrippedCounter = 0;
  if (inlineOptions) {
    for (const ext of topLevel) {
      if (ext.isSync) continue;
      const stripped = isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );
      if (stripped) {
        const idx = earlyStrippedCounter++;
        const counter = 0xffff0000 + idx * 2;
        earlyQrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        earlyQrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  }

  /**
   * Get the QRL variable name for a symbol, accounting for stripped segments.
   */
  function getQrlVarName(symbolName: string): string {
    return earlyQrlVarNames.get(symbolName) ?? `q_${symbolName}`;
  }

  // -----------------------------------------------------------------------
  // Step 4: Rewrite call sites (only top-level extractions)
  // -----------------------------------------------------------------------
  for (const ext of topLevel) {
    if (ext.isSync) {
      // sync$: replace entire call with _qrlSync(original, "minified")
      s.overwrite(ext.callStart, ext.callEnd, buildSyncTransform(ext.bodyText));
    } else if (ext.isBare) {
      // Bare $(): replace entire call with QRL variable name
      s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ext.symbolName));
    } else {
      // Named marker (component$, useTask$, etc.)
      // Replace callee
      s.overwrite(ext.calleeStart, ext.calleeEnd, ext.qrlCallee);
      // Replace argument with QRL variable name
      s.overwrite(ext.argStart, ext.argEnd, getQrlVarName(ext.symbolName));
      // Add PURE annotation for componentQrl calls
      if (needsPureAnnotation(ext.qrlCallee)) {
        s.appendLeft(ext.callStart, '/*#__PURE__*/ ');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 4b: .w() wrapping for captures (CAPT-03)
  // -----------------------------------------------------------------------
  for (const ext of topLevel) {
    if (ext.isSync) continue;
    if (ext.captureNames.length === 0) continue;

    // Build the .w() call: .w([\n        var1,\n        var2\n    ])
    const wrapVars = ext.captureNames.join(',\n        ');
    const wText = `.w([\n        ${wrapVars}\n    ])`;

    if (ext.isBare) {
      // Bare $(): entire call was replaced with QRL var name at callStart..callEnd
      s.appendLeft(ext.callEnd, wText);
    } else {
      // Named marker: arg was replaced with QRL var name at argStart..argEnd
      s.appendLeft(ext.argEnd, wText);
    }
  }

  // -----------------------------------------------------------------------
  // Step 4c: JSX transformation (Phase 4)
  // -----------------------------------------------------------------------
  const isDevMode = mode === 'dev';
  let jsxResult: JsxTransformOutput | null = null;
  if (jsxOptions?.enableJsx) {
    // Build skip ranges from extraction argument ranges.
    // These regions have already been rewritten (e.g., $() argument replaced with q_symbolName)
    // so the JSX transform must not try to overwrite nodes within them.
    const skipRanges = topLevel.map((ext) => ({
      start: ext.argStart,
      end: ext.argEnd,
    }));
    // Run JSX transform on the same magic-string instance.
    // This converts JSX elements/fragments to _jsxSorted/_jsxSplit calls.
    // Must run AFTER call site rewriting (so $() calls are replaced)
    // but BEFORE import assembly (so we can add JSX imports).
    jsxResult = transformAllJsx(
      source, s, program, jsxOptions.importedNames, skipRanges,
      isDevMode ? { relPath } : undefined,
    );
  }

  // -----------------------------------------------------------------------
  // Step 5: Build optimizer-added imports (IMP-04)
  // -----------------------------------------------------------------------
  const neededImports = new Map<string, string>(); // symbol -> source
  const isInline = inlineOptions?.inline === true;

  // Only top-level extractions contribute imports to the parent module.
  // Nested extractions get their imports in the segment module that contains them.
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);

  if (isInline) {
    // Inline strategy: import _noopQrl or _noopQrlDEV instead of qrl/qrlDEV
    if (hasTopLevelNonSync) {
      const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
      if (!alreadyImported.has(noopSymbol)) {
        neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
    // Also check if any non-stripped segments need _captures for .s() bodies
    const hasStripped = topLevel.some(
      (e) => !e.isSync && inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      ),
    );
    const hasNonStripped = topLevel.some(
      (e) => !e.isSync && !(inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      )),
    );
    // _captures import needed if any non-stripped segment has captures
    const needsCapturesImport = topLevel.some(
      (e) => !e.isSync && e.captureNames.length > 0 && !(inlineOptions && isStrippedSegment(
        e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      )),
    );
    if (needsCapturesImport && !alreadyImported.has('_captures')) {
      neededImports.set('_captures', '@qwik.dev/core');
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    // Non-inline with strip: still use qrl/qrlDEV for non-stripped, _noopQrl for stripped
    if (hasTopLevelNonSync) {
      // Check if there are non-stripped segments that need qrl
      const hasNonStripped = topLevel.some(
        (e) => !e.isSync && !isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      const hasStripped = topLevel.some(
        (e) => !e.isSync && isStrippedSegment(
          e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
        ),
      );
      if (hasNonStripped) {
        const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
        if (!alreadyImported.has(qrlSymbol)) {
          neededImports.set(qrlSymbol, '@qwik.dev/core');
        }
      }
      if (hasStripped) {
        const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
        if (!alreadyImported.has(noopSymbol)) {
          neededImports.set(noopSymbol, '@qwik.dev/core');
        }
      }
    }
  } else {
    // Default: no inline, no strip
    if (hasTopLevelNonSync) {
      const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
      if (!alreadyImported.has(qrlSymbol)) {
        neededImports.set(qrlSymbol, '@qwik.dev/core');
      }
    }
  }

  // Each unique qrlCallee from top-level extractions needs an import
  for (const ext of topLevel) {
    if (ext.isSync) {
      // _qrlSync import
      if (!alreadyImported.has('_qrlSync')) {
        neededImports.set('_qrlSync', '@qwik.dev/core');
      }
      continue;
    }
    if (ext.isBare) continue; // bare $ doesn't need a Qrl wrapper import

    const qrlCallee = ext.qrlCallee;
    if (qrlCallee && !alreadyImported.has(qrlCallee)) {
      // Only add import if not custom inlined (custom inlined are locally defined)
      if (!isCustomInlined(ext, originalImports)) {
        neededImports.set(qrlCallee, getQrlImportSource(qrlCallee));
      }
    }
  }

  // Add JSX transform imports (Phase 4)
  if (jsxResult) {
    for (const sym of jsxResult.neededImports) {
      if (!alreadyImported.has(sym)) {
        neededImports.set(sym, '@qwik.dev/core');
      }
    }
    if (jsxResult.needsFragment && !alreadyImported.has('_Fragment')) {
      neededImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
    }
    // Hoisted signal declarations (_hf0, _hf0_str, etc.) need to be added
    // They will be prepended after imports in the preamble assembly step
  }

  // Sort imports alphabetically by symbol name
  const sortedImports = Array.from(neededImports.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  // Build import statements (each separate)
  const importStatements = sortedImports.map(
    ([symbol, src]) => `import { ${symbol} } from "${src}";`,
  );

  // -----------------------------------------------------------------------
  // Step 5b: Build QRL declarations
  // -----------------------------------------------------------------------
  // Only top-level (non-nested) non-sync extractions get QRL declarations in the parent
  const topLevelNonSync = extractions.filter((e) => !e.isSync && e.parent === null);

  // Track stripped segment counter for sentinel naming
  let strippedCounter = 0;
  // Map symbolName -> QRL variable name (for .s() calls and call site references)
  const qrlVarNames = new Map<string, string>();

  const qrlDecls: string[] = [];

  if (isInline) {
    // Inline/hoist strategy: _noopQrl declarations
    for (const ext of topLevelNonSync) {
      const stripped = inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath,
            lo: 0,
            hi: 0,
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        // Sentinel variable name for stripped segments
        const counter = 0xffff0000 + idx * 2;
        qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildNoopQrlDevDeclaration(ext.symbolName, {
            file: devFilePath,
            lo: ext.loc[0],
            hi: ext.loc[1],
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildNoopQrlDeclaration(ext.symbolName));
        }
        qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else if (inlineOptions && !inlineOptions.inline) {
    // Non-inline with strip: stripped segments get _noopQrl, others get qrl
    for (const ext of topLevelNonSync) {
      const stripped = isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );

      if (stripped) {
        const idx = strippedCounter++;
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
            file: devFilePath,
            lo: 0,
            hi: 0,
            displayName: ext.displayName,
          }));
        } else {
          qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
        }
        const counter = 0xffff0000 + idx * 2;
        qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
      } else {
        if (isDevMode && devFilePath) {
          qrlDecls.push(buildQrlDevDeclaration(
            ext.symbolName,
            ext.canonicalFilename,
            devFilePath,
            ext.loc[0],
            ext.loc[1],
            ext.displayName,
          ));
        } else {
          qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename));
        }
        qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
      }
    }
  } else {
    // Default: standard qrl declarations
    for (const ext of topLevelNonSync) {
      if (isDevMode && devFilePath) {
        qrlDecls.push(buildQrlDevDeclaration(
          ext.symbolName,
          ext.canonicalFilename,
          devFilePath,
          ext.loc[0],
          ext.loc[1],
          ext.displayName,
        ));
      } else {
        qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename));
      }
      qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
    }
  }

  // Sort QRL declarations for deterministic output
  qrlDecls.sort();

  // -----------------------------------------------------------------------
  // Step 5c: Build .s() calls for inline strategy
  // -----------------------------------------------------------------------
  const sCalls: string[] = [];
  if (isInline) {
    // Order: stripped/noop segments first, then non-stripped, then component body last
    const stripped: ExtractionResult[] = [];
    const nonStripped: ExtractionResult[] = [];
    const components: ExtractionResult[] = [];

    for (const ext of topLevelNonSync) {
      const isStripped = inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );
      if (isStripped) {
        stripped.push(ext);
      } else if (ext.ctxName === 'component') {
        components.push(ext);
      } else {
        nonStripped.push(ext);
      }
    }

    // Stripped segments: no .s() call (they are noop)
    // Non-stripped, non-component segments: emit .s() with body
    for (const ext of nonStripped) {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      sCalls.push(buildSCall(varName, ext.bodyText));
    }

    // Component segments last
    for (const ext of components) {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      sCalls.push(buildSCall(varName, ext.bodyText));
    }
  }

  // -----------------------------------------------------------------------
  // Step 6: Assemble final output
  // -----------------------------------------------------------------------
  // The modified body (with import rewrites and call rewrites) already comes from s.toString()
  // We need to prepend: imports + // + QRL decls + // + .s() calls (if inline)

  const preamble: string[] = [];
  if (importStatements.length > 0) {
    preamble.push(...importStatements);
  }
  if (qrlDecls.length > 0) {
    preamble.push('//');
    preamble.push(...qrlDecls);
  }
  // Add hoisted signal declarations (_hf0, _hf0_str, etc.)
  if (jsxResult && jsxResult.hoistedDeclarations.length > 0) {
    preamble.push(...jsxResult.hoistedDeclarations);
  }
  // Add .s() calls for inline strategy (after QRL declarations, before body/exports)
  if (sCalls.length > 0) {
    preamble.push(...sCalls);
  }
  preamble.push('//');

  s.prepend(preamble.join('\n') + '\n');

  // -----------------------------------------------------------------------
  // Step 6b: _auto_ exports (module-level migration)
  // -----------------------------------------------------------------------
  if (migrationDecisions) {
    for (const decision of migrationDecisions) {
      if (decision.action === 'reexport') {
        s.append(`\nexport { ${decision.varName} as _auto_${decision.varName} };`);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 6c: Remove migrated (moved) declarations from parent
  // -----------------------------------------------------------------------
  if (migrationDecisions && moduleLevelDecls) {
    // Track which ranges we've already removed to avoid double-removal
    // (multiple bindings from the same declaration)
    const removedRanges = new Set<string>();
    for (const decision of migrationDecisions) {
      if (decision.action !== 'move') continue;
      const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
      if (!decl) continue;
      const rangeKey = `${decl.declStart}:${decl.declEnd}`;
      if (removedRanges.has(rangeKey)) continue;
      removedRanges.add(rangeKey);
      // Remove the declaration text including trailing newline
      let end = decl.declEnd;
      if (end < source.length && source[end] === '\n') end++;
      s.remove(decl.declStart, end);
    }
  }

  return {
    code: s.toString(),
    extractions,
  };
}
