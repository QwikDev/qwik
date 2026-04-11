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
import { injectCapturesUnpacking } from './segment-codegen.js';
import { transformEventPropName } from './event-handler-transform.js';
import { transformAllJsx, type JsxTransformOutput } from './jsx-transform.js';
import { stripExportDeclarations } from './strip-exports.js';
import { replaceConstants } from './const-replacement.js';
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
// .s() body transformation for inline/hoist strategy
// ---------------------------------------------------------------------------

/**
 * Options for JSX transpilation within inline .s() body text.
 */
interface SCallBodyJsxOptions {
  /** Whether to apply JSX transpilation */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Dev mode options for JSX source info */
  devOptions?: { relPath: string };
}

/**
 * Transform an extraction's body text for use in an inline .s() call.
 *
 * For parent extractions (those with nested children), the body is transformed:
 * 1. Nested $() call sites rewritten to QRL variable references
 * 2. $-suffixed callee names renamed to Qrl-suffixed
 * 3. .w([captures]) appended for children with captures
 * 4. _captures[N] unpacking injected for this extraction's own captures
 * 5. JSX transpilation (if enabled) -- converts raw JSX to _jsxSorted calls
 *
 * For leaf extractions (no nested children, no own captures), the body is returned as-is.
 */
function transformSCallBody(
  ext: ExtractionResult,
  allExtractions: ExtractionResult[],
  qrlVarNames: Map<string, string>,
  jsxBodyOptions?: SCallBodyJsxOptions,
): { transformedBody: string; additionalImports: Map<string, string>; hoistedDeclarations: string[] } {
  let body = ext.bodyText;
  const additionalImports = new Map<string, string>();
  const hoistedDeclarations: string[] = [];

  // 1. Find nested extractions (children of this extraction)
  const nested = allExtractions.filter(e => e.parent === ext.symbolName);

  // 2. Rewrite nested call sites in descending position order
  //    to avoid position shifting issues
  if (nested.length > 0) {
    const bodyOffset = ext.argStart;
    const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);

    for (const child of sortedNested) {
      const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;

      const relCallStart = child.callStart - bodyOffset;
      const relCallEnd = child.callEnd - bodyOffset;

      if (relCallStart >= 0 && relCallEnd <= body.length) {
        if (child.isBare) {
          // Bare $() -> just the QRL variable name
          body = body.slice(0, relCallStart) + childVarName + body.slice(relCallEnd);
        } else if (child.ctxKind === 'eventHandler') {
          // JSX event handler attribute: onClick$={() => ...) -> q-e:click={q_varName}
          // The callStart..callEnd range covers the full attribute text: onClick$(() => ...}
          // Transform the event prop name (e.g., onClick$ -> q-e:click)
          const transformedPropName = transformEventPropName(child.ctxName, new Set());
          if (transformedPropName) {
            let replacement = `${transformedPropName}={${childVarName}`;
            if (child.captureNames.length > 0) {
              replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
            }
            replacement += '}';
            body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
          } else {
            // Fallback: just replace with var name
            body = body.slice(0, relCallStart) + childVarName + body.slice(relCallEnd);
          }
        } else {
          // Named marker: callee$(args) -> calleeQrl(qrlVar)
          let replacement = child.qrlCallee + '(' + childVarName;

          // Add .w([captures]) if the child has captures
          if (child.captureNames.length > 0) {
            replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
          }

          replacement += ')';
          body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);

          // Track that we need the Qrl-suffixed callee import
          if (child.qrlCallee) {
            additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee));
          }
        }
      }
    }
  }

  // 3. Inject _captures unpacking if this extraction has captures
  if (ext.captureNames.length > 0) {
    body = injectCapturesUnpacking(body, ext.captureNames);
    additionalImports.set('_captures', '@qwik.dev/core');
  }

  // 4. JSX transpilation within the body text
  if (jsxBodyOptions?.enableJsx) {
    // Wrap the body as a parseable module-level expression
    const wrapperPrefix = 'const __body__ = ';
    const wrappedSource = wrapperPrefix + body;

    // Parse the wrapped source to get an AST
    const parseResult = parseSync('__body__.tsx', wrappedSource);
    if (parseResult.program && !parseResult.errors?.length) {
      const bodyS = new MagicString(wrappedSource);

      // Augment importedNames with QRL variable names so they're classified as
      // const in prop classification (they're module-level const declarations)
      const bodyImportedNames = new Set(jsxBodyOptions.importedNames);
      for (const [, varName] of qrlVarNames) {
        bodyImportedNames.add(varName);
      }

      // Run JSX transform on the wrapped body
      const bodyJsxResult = transformAllJsx(
        wrappedSource,
        bodyS,
        parseResult.program,
        bodyImportedNames,
        [], // No skip ranges within the body
        jsxBodyOptions.devOptions,
      );

      // Extract the transformed body by stripping the wrapper prefix
      const transformedWrapped = bodyS.toString();
      body = transformedWrapped.slice(wrapperPrefix.length);

      // Strip trailing semicolon if one was added by the wrapper
      if (body.endsWith(';') && !ext.bodyText.endsWith(';')) {
        body = body.slice(0, -1);
      }

      // Collect imports needed by JSX transform
      for (const sym of bodyJsxResult.neededImports) {
        additionalImports.set(sym, '@qwik.dev/core');
      }
      if (bodyJsxResult.needsFragment) {
        additionalImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
      }

      // Collect hoisted declarations for the parent preamble
      hoistedDeclarations.push(...bodyJsxResult.hoistedDeclarations);
    }
  }

  return { transformedBody: body, additionalImports, hoistedDeclarations };
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
  stripExports?: string[],
  isServer?: boolean,
  explicitExtensions?: boolean,
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
  // Step 1+2: Remove import declarations from body, track surviving user imports
  // -----------------------------------------------------------------------
  // Instead of editing imports in-place, we REMOVE all import declarations from
  // the body and reassemble them in the preamble (Step 6). This ensures optimizer
  // imports appear first, then surviving user imports, matching Rust output ordering.
  const survivingUserImports: string[] = [];

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    const sourceNode = node.source;
    const rewrittenSource = rewriteImportSource(sourceNode.value);

    // Detect quote style from original source (node.source.raw starts with ' or ")
    const rawSource = (sourceNode as any).raw ?? sourceNode.value;
    const quoteChar = rawSource.startsWith("'") ? "'" : '"';

    // Side-effect imports (no specifiers): keep in original position, just rewrite source
    if (!specifiers || specifiers.length === 0) {
      if (rewrittenSource !== sourceNode.value) {
        s.overwrite(sourceNode.start + 1, sourceNode.end - 1, rewrittenSource);
      }
      continue;
    }

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

    // Remove the import declaration from the body
    let end = node.end;
    if (end < source.length && source[end] === '\n') end++;
    s.remove(node.start, end);

    if (toRemove.length === specifiers.length) {
      // All specifiers are markers: import is fully consumed, no surviving user import
      continue;
    }

    // For single-quoted Qwik core imports (user-written): if the surviving
    // (non-marker) specifiers include a non-$-suffixed identifier (like useStore),
    // preserve ALL original specifiers including markers. This matches Rust optimizer
    // behavior where the original user import is kept intact.
    const isQwikSource = rewrittenSource.startsWith('@qwik.dev/') ||
      rewrittenSource.startsWith('@builder.io/qwik');
    let preserveAll = false;
    if (isQwikSource && quoteChar === "'") {
      const hasNonDollarSurvivor = specifiers.some((spec: any, i: number) => {
        if (toRemove.includes(i)) return false;
        if (spec.type !== 'ImportSpecifier') return true; // default/namespace always non-$
        const importedName = spec.imported?.name ?? spec.local.name;
        return !importedName.endsWith('$');
      });
      if (hasNonDollarSurvivor) preserveAll = true;
    }

    // Build surviving user import, preserving original quote style
    let defaultPart = '';
    let nsPart = '';
    const namedParts: string[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      if (!preserveAll && toRemove.includes(i)) continue;
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

    if (importParts) {
      survivingUserImports.push(`import ${importParts} from ${quoteChar}${rewrittenSource}${quoteChar};`);
    }
  }

  // -----------------------------------------------------------------------
  // Step 2b: Strip exports (MODE-06)
  // -----------------------------------------------------------------------
  if (stripExports && stripExports.length > 0) {
    stripExportDeclarations(source, s, program, stripExports, originalImports);
  }

  // -----------------------------------------------------------------------
  // Step 2c: Const replacement (MODE-07)
  // -----------------------------------------------------------------------
  const isDev = mode === 'dev' ? true : mode === 'prod' ? false : undefined;
  if (isServer !== undefined || isDev !== undefined) {
    replaceConstants(source, s, program, originalImports, isServer, isDev);
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
    // For inline/hoist, compute QRL var names for ALL non-sync extractions (including nested)
    for (const ext of extractions) {
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
  // Step 4a: Remove unused variable bindings wrapping QRL call sites
  // -----------------------------------------------------------------------
  // When a variable declaration like `const foo = component$(...)` is:
  // 1. NOT exported
  // 2. NOT referenced elsewhere in the module body
  // Then the Rust optimizer strips `const foo = `, leaving just the call expression.
  // We detect this by finding VariableDeclaration nodes whose init range contains
  // a top-level extraction's call site.
  {
    for (const stmt of program.body) {
      // Skip exported declarations
      if (stmt.type === 'ExportNamedDeclaration') continue;
      if (stmt.type !== 'VariableDeclaration') continue;

      const decl = stmt;
      if (!decl.declarations || decl.declarations.length !== 1) continue;

      const declarator = decl.declarations[0];
      if (!declarator.init) continue;

      // Check if ANY top-level extraction's call site is within this declarator's init range
      // but NOT the init itself (if the extraction IS the init, keep the binding)
      const initStart = declarator.init.start;
      const initEnd = declarator.init.end;
      const containsNestedExtraction = topLevel.some(
        (ext) => !ext.isSync &&
          ext.callStart >= initStart && ext.callEnd <= initEnd &&
          // The extraction must be NESTED inside the init, not the init itself
          !(ext.callStart === initStart && ext.callEnd === initEnd),
      );
      if (!containsNestedExtraction) continue;

      // The variable name
      const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
      if (!varName) continue;

      // Check if varName is referenced elsewhere in the module body
      // (excluding the declaration itself and import sections).
      const wordBoundaryRegex = new RegExp(`\\b${varName}\\b`);
      let bodyText = '';
      for (const bodyStmt of program.body) {
        if (bodyStmt.type === 'ImportDeclaration') continue;
        if (bodyStmt === decl) continue;
        bodyText += source.slice(bodyStmt.start, bodyStmt.end) + '\n';
      }

      if (!wordBoundaryRegex.test(bodyText)) {
        // Variable is not used elsewhere: strip `const/let/var varName = ` prefix
        // Remove from declaration start to the init start
        s.remove(decl.start, initStart);
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

  // For inline/hoist: ALL non-sync extractions (including nested) contribute imports.
  // For other strategies: only top-level extractions contribute imports to the parent module.
  const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
  const hasAnyNonSync = extractions.some((e) => !e.isSync);

  if (isInline) {
    // Inline strategy: import _noopQrl or _noopQrlDEV instead of qrl/qrlDEV
    if (hasAnyNonSync) {
      const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
      if (!alreadyImported.has(noopSymbol)) {
        neededImports.set(noopSymbol, '@qwik.dev/core');
      }
    }
    // _captures import needed if any non-stripped extraction has captures
    // (checked across ALL extractions, not just top-level)
    const needsCapturesImport = extractions.some(
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

  // NOTE: Import statement generation is deferred until after Step 5c,
  // because transformSCallBody() in Step 5c may add additional imports
  // (e.g., Qrl-suffixed callee imports like useStylesQrl, useBrowserVisibleTaskQrl).

  // -----------------------------------------------------------------------
  // Step 5b: Build QRL declarations
  // -----------------------------------------------------------------------
  // For inline/hoist strategy: ALL non-sync extractions (including nested) get QRL declarations.
  // For other strategies: only top-level (non-nested) non-sync extractions.
  const topLevelNonSync = extractions.filter((e) => !e.isSync && e.parent === null);
  const allNonSync = extractions.filter((e) => !e.isSync);

  // Track stripped segment counter for sentinel naming
  let strippedCounter = 0;
  // Map symbolName -> QRL variable name (for .s() calls and call site references)
  const qrlVarNames = new Map<string, string>();

  const qrlDecls: string[] = [];

  if (isInline) {
    // Inline/hoist strategy: _noopQrl declarations for ALL non-sync extractions
    for (const ext of allNonSync) {
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
          qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions));
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
        qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions));
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
  const inlineHoistedDeclarations: string[] = [];
  if (isInline) {
    // Build JSX options for inline body transformation (if JSX is enabled)
    const sCallJsxOptions: SCallBodyJsxOptions | undefined = jsxOptions?.enableJsx
      ? {
          enableJsx: true,
          importedNames: jsxOptions.importedNames,
          devOptions: isDevMode ? { relPath } : undefined,
        }
      : undefined;

    // ALL non-sync, non-stripped extractions get .s() calls (including nested).
    // Order: nested extractions first (in extraction order per parent group),
    // then top-level non-component, then top-level component.
    const nestedExts: ExtractionResult[] = [];
    const topNonComponent: ExtractionResult[] = [];
    const topComponent: ExtractionResult[] = [];

    for (const ext of allNonSync) {
      const isStrippedExt = inlineOptions && isStrippedSegment(
        ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers,
      );
      if (isStrippedExt) continue; // Stripped segments: no .s() call

      if (ext.parent !== null) {
        nestedExts.push(ext);
      } else if (ext.ctxName === 'component') {
        topComponent.push(ext);
      } else {
        topNonComponent.push(ext);
      }
    }

    // Emit nested .s() calls first (their bodies are leaf — no transformation needed for nesting,
    // but captures may need injection)
    for (const ext of nestedExts) {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      const { transformedBody, additionalImports, hoistedDeclarations } = transformSCallBody(
        ext, extractions, qrlVarNames, sCallJsxOptions,
      );
      sCalls.push(buildSCall(varName, transformedBody));
      inlineHoistedDeclarations.push(...hoistedDeclarations);
      for (const [sym, src] of additionalImports) {
        if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
          neededImports.set(sym, src);
        }
      }
    }

    // Then top-level non-component .s() calls (with transformed bodies)
    for (const ext of topNonComponent) {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      const { transformedBody, additionalImports, hoistedDeclarations } = transformSCallBody(
        ext, extractions, qrlVarNames, sCallJsxOptions,
      );
      sCalls.push(buildSCall(varName, transformedBody));
      inlineHoistedDeclarations.push(...hoistedDeclarations);
      for (const [sym, src] of additionalImports) {
        if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
          neededImports.set(sym, src);
        }
      }
    }

    // Component .s() calls last (with transformed bodies)
    for (const ext of topComponent) {
      const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
      const { transformedBody, additionalImports, hoistedDeclarations } = transformSCallBody(
        ext, extractions, qrlVarNames, sCallJsxOptions,
      );
      sCalls.push(buildSCall(varName, transformedBody));
      inlineHoistedDeclarations.push(...hoistedDeclarations);
      for (const [sym, src] of additionalImports) {
        if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
          neededImports.set(sym, src);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Step 5d: Build import statements (deferred from Step 5 to include
  // additional imports discovered during Step 5c body transformation)
  // -----------------------------------------------------------------------
  const sortedImports = Array.from(neededImports.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const importStatements = sortedImports.map(
    ([symbol, src]) => `import { ${symbol} } from "${src}";`,
  );

  // -----------------------------------------------------------------------
  // Step 6: Assemble final output
  // -----------------------------------------------------------------------
  // The modified body (with import rewrites and call rewrites) already comes from s.toString()
  // We need to prepend: imports + // + QRL decls + // + .s() calls (if inline)

  const preamble: string[] = [];
  if (importStatements.length > 0) {
    preamble.push(...importStatements);
  }
  // Add surviving user imports after optimizer imports (matching Rust ordering)
  if (survivingUserImports.length > 0) {
    preamble.push(...survivingUserImports);
  }
  if (qrlDecls.length > 0) {
    preamble.push('//');
    preamble.push(...qrlDecls);
  }
  // Add hoisted signal declarations (_hf0, _hf0_str, etc.)
  if (jsxResult && jsxResult.hoistedDeclarations.length > 0) {
    preamble.push(...jsxResult.hoistedDeclarations);
  }
  // Add hoisted declarations from inline .s() body JSX transforms
  if (inlineHoistedDeclarations.length > 0) {
    preamble.push(...inlineHoistedDeclarations);
  }
  // Add .s() calls for inline strategy (after QRL declarations, before body/exports)
  if (sCalls.length > 0) {
    preamble.push('//');
    preamble.push(...sCalls);
  } else {
    preamble.push('//');
  }

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
