/**
 * Parent module rewriting engine for the Qwik optimizer.
 *
 * Surgically edits source text via magic-string, replacing $() calls with QRL
 * references, managing imports, and assembling the final parent module.
 *
 * Output structure:
 *   [optimizer-added imports]
 *   [original non-marker imports]
 *   //
 *   [QRL const declarations]
 *   //
 *   [rewritten module body]
 *   [_auto_ exports if any]
 */

import MagicString from 'magic-string';
import { createRegExp, exactly, wordBoundary } from 'magic-regexp';
import { parseSync } from 'oxc-parser';
import type { ConsolidatedSegment, ExtractionResult, Mutable } from '../extract.js';
import type { ImportInfo } from '../marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from '../variable-migration.js';
import type { RelativePath } from '../types/brands.js';
import { rewriteImportSource } from '../rewrite-imports.js';
import {
  buildSyncTransform,
  needsPureAnnotation,
  getQrlCalleeName,
} from '../rewrite-calls.js';
import { isEventHandlerOrJsxProp, isStrippedSegment, matchesRegCtxName } from './predicates.js';
import { transformEventPropName } from '../transform/event-handlers.js';
import { transformAllJsx, JsxKeyCounter } from '../transform/jsx.js';
import { computeKeyPrefix } from '../key-prefix.js';
import {
  collectJsxFunctionNamesFromIterable,
  transformJsxCalls,
} from '../transform/jsx-call-transform.js';
import { stripExportDeclarations } from '../strip-exports.js';
import { replaceConstants } from '../const-replacement.js';
import type { EmitMode } from '../types.js';
import { collectBindingNamesFromPattern } from '../utils/binding-pattern.js';
import type { AstFunction, AstNode, AstProgram, ImportDeclarationSpecifier, ImportSpecifier } from '../../ast-types.js';
import { forEachAstChild } from '../utils/ast.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';
import type { RewriteContext } from './rewrite-context.js';
import {
  collectNeededImports,
  buildQrlDeclarations,
  buildInlineSCalls,
  filterUnusedImports,
  assembleOutput,
} from './output-assembly.js';
import { detectAndRenameCollisions } from './symbol-collision.js';

// Re-export split modules for backward compatibility
export {
  resolveConstLiterals,
  resolveConstLiteralsInClosure,
  inlineConstCaptures,
  propagateConstLiteralsInBody,
} from './const-propagation.js';
export {
  applyRawPropsTransformDetailed,
  extractDestructuredFieldMap,
  extractDestructuredFieldDefaultsMap,
  consolidateRawPropsInWCalls,
  applyRawPropsTransform,
  type RawPropsTransformResult,
} from './raw-props.js';
export { transformInlineSegmentBody } from './inline-body.js';

// Re-export context type for output-assembly
export type { RewriteContext } from './rewrite-context.js';

// Imports used internally
import { extractDestructuredFieldMap, extractDestructuredFieldDefaultsMap } from './raw-props.js';

export interface InlineStrategyOptions {
  /** Whether to use inline/hoist strategy (_noopQrl + .s()) */
  readonly inline: boolean;
  /** Entry strategy type: 'inline' puts body in .s(), 'hoist' extracts body as const */
  readonly entryType?: 'inline' | 'hoist';
  /**
   * `mode: 'lib'` reuses the inline pipeline but a post-pass collapses
   * the `_noopQrl(name)` + `q_X.s(body)` triple into a single
   * `inlinedQrl(body, name, [captures])` literal at every `q_X` reference.
   */
  readonly isLibMode?: boolean;
  /** Strip context names (server/client strip) */
  readonly stripCtxName?: readonly string[];
  /** Strip event handlers */
  readonly stripEventHandlers?: boolean;
  /** Register context names (server-tagged extractions get _regSymbol wrapping) */
  readonly regCtxName?: readonly string[];
}

export interface ParentRewriteResult {
  /** Rewritten parent module source code. */
  code: string;
  /**
   * All extractions, post-`resolveNesting` (parent references resolved,
   * phase discriminator flipped to `'consolidated'`). Same underlying array
   * as the `extractions` parameter passed to {@link rewriteParentModule} —
   * mutated in place per the in-place phase-transition pattern.
   */
  extractions: ConsolidatedSegment[];
  /**
   * Post-JSX-rewrite source text for each module-level decl that
   * migration will MOVE into a segment file. Keyed by `varName`.
   * Consumed by `segment-generation.ts:wireMigration` so the moved decl
   * carries the rewritten JSX (Qwik form) rather than the raw source
   * (which would survive into the segment and get React-transformed by
   * oxc-transform's TS-strip pass).
   */
  movedDeclSnapshots: Map<string, string>;
  /** Final JSX key counter value after parent module transform (for segment continuation). */
  jsxKeyCounterValue?: number;
}

/**
 * Parse array literal items from source text like "[left, true, right]".
 */
function parseArrayItems(arrayText: string): string[] {
  let inner = arrayText.trim();
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);
  inner = inner.trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function isMarkerSpecifier(
  importedName: string,
  extractedCalleeNames: Set<string>,
): boolean {
  return extractedCalleeNames.has(importedName);
}

/**
 * Get the name an import specifier is bringing in from the source module.
 * Handles ES2022 `import { "foo" as bar } from ...` (StringLiteral imported)
 * by falling through to the local binding name; ordinary
 * `import { foo as bar }` returns the imported Identifier's `name`.
 */
function importedSpecifierName(spec: ImportSpecifier): string {
  const imported = spec.imported;
  if (imported.type === 'Identifier') return imported.name;
  return spec.local.name;
}

function isCustomInlined(
  ext: ExtractionResult,
  originalImports: Map<string, ImportInfo>,
): boolean {
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) return false;
  }
  return true;
}

export interface JsxRewriteOptions {
  enableJsx: boolean;
  importedNames: Set<string>;
  enableSignals?: boolean;
}

/**
 * Rewrite a parent module source using magic-string.
 *
 * Pipeline:
 *   1. processImports       - remove/filter import declarations, track survivors
 *   2. applyModeTransforms  - strip exports, replace constants
 *   3. resolveNesting       - determine parent-child extraction relationships
 *   4. rewriteCallSites     - replace $() calls with QRL references
 *   5. addCaptureWrapping   - append .w([captures]) to QRL references
 *   6. runJsxTransform      - convert JSX to _jsxSorted calls
 *   7. collectNeededImports - gather all optimizer-added imports
 *   8. buildQrlDeclarations - generate QRL const declarations
 *   9. buildInlineSCalls    - generate .s() calls for inline/hoist strategy
 *  10. filterUnusedImports  - remove specifiers only used in segments
 *  11. assembleOutput       - prepend preamble, insert .s() calls, strip TS
 */
export function rewriteParentModule(
  source: string,
  relPath: RelativePath,
  extractions: ExtractionResult[],
  originalImports: Map<string, ImportInfo>,
  migrationDecisions?: MigrationDecision[],
  moduleLevelDecls?: ModuleLevelDecl[],
  jsxOptions?: JsxRewriteOptions,
  mode?: EmitMode,
  devFilePath?: string,
  inlineOptions?: InlineStrategyOptions,
  stripExports?: readonly string[],
  isServer?: boolean,
  explicitExtensions?: boolean,
  transpileTs?: boolean,
  minify?: string,
  outputExtension?: string,
  existingProgram?: AstProgram,
  /** Closure AST nodes per extraction; threaded into `RewriteContext.closureNodes`. */
  closureNodes?: Map<string, AstFunction>,
  /**
   * Raw user-supplied dev path from `TransformModuleInput.devPath`,
   * unlike `devFilePath` which always falls back to a composed path.
   * Needed so JSX dev-info `fileName:` only switches when the user
   * explicitly overrides.
   */
  userDevPath?: string,
  /**
   * Source carries `/* @jsxImportSource <non-qwik-pkg> *‌/`. When true,
   * `runJsxTransform` is skipped — see RewriteContext.hasForeignJsxRuntime.
   */
  hasForeignJsxRuntime?: boolean,
): ParentRewriteResult {
  const s = new MagicString(source);
  const program = existingProgram ?? parseSync(relPath, source, RAW_TRANSFER_PARSER_OPTIONS).program;

  const ctx: RewriteContext = {
    source, relPath, s, program, closureNodes, extractions, originalImports,
    migrationDecisions, moduleLevelDecls, jsxOptions, mode, devFilePath,
    userDevPath,
    inlineOptions, stripExports, isServer, explicitExtensions, transpileTs,
    minify, outputExtension,
    // Accumulated state
    extractedCalleeNames: new Set<string>(),
    alreadyImported: new Set<string>(),
    survivingUserImports: [],
    survivingImportInfos: [],
    topLevel: [],
    earlyQrlVarNames: new Map(),
    neededImports: new Map(),
    qrlVarNames: new Map(),
    qrlDecls: [],
    sCalls: [],
    inlineHoistedDeclarations: [],
    inlinedQrlSymbols: new Set(),
    eventHandlerExtraImports: [],
    noArgQrlCallees: [],
    jsxResult: null,
    jsxKeyCounterValue: 0,
    isDevMode: mode === 'dev' || mode === 'hmr',
    isInline: inlineOptions?.inline === true,
    isLibMode: inlineOptions?.isLibMode === true,
    hasForeignJsxRuntime: hasForeignJsxRuntime === true,
  };

  collectExtractedCalleeNames(ctx);
  processImports(ctx);
  applyModeTransforms(ctx);
  resolveNesting(ctx);

  // Flip the `phase` discriminator from 'captured' to 'consolidated' now
  // that `resolveNesting` has resolved each extraction's `parent`
  // reference (the last phase-spanning field that needed to settle).
  // Remaining helpers in this function and all Phase 5 consumers
  // downstream see `ConsolidatedSegment` types. Internal-builder cast
  // (FFI-boundary pattern, same family as the Mutable<> casts at
  // `rewriteCallSites` / `addCaptureWrapping`).
  for (const ext of extractions) {
    (ext as Mutable<ExtractionResult>).phase = 'consolidated';
  }

  preConsolidateRawPropsCaptures(ctx);
  ctx.topLevel = extractions.filter((e) => e.parent === null);
  preComputeQrlVarNames(ctx);
  rewriteCallSites(ctx);
  rewriteNoArgMarkers(ctx);
  removeUnusedBindings(ctx);
  removeDuplicateExports(ctx);
  addCaptureWrapping(ctx);
  runJsxTransform(ctx);
  runPeerToolJsxCallTransform(ctx);

  // Capture post-JSX-rewrite text for each module-level decl that
  // migration will MOVE into a segment file. Without this, JSX inside
  // the moved decl (e.g. a non-component$ helper function with
  // `<div {...props}>`) never receives the Qwik JSX rewrite and falls
  // through to oxc-transform's default React JSX transform, emitting
  // `_jsx`. Slicing from MagicString here (post-JSX-rewrite,
  // pre-assembly) carries the rewritten JSX into the segment file.
  const movedDeclSnapshots = new Map<string, string>();
  if (migrationDecisions && moduleLevelDecls) {
    const declsByName = new Map<string, ModuleLevelDecl>();
    for (const decl of moduleLevelDecls) declsByName.set(decl.name, decl);
    for (const decision of migrationDecisions) {
      if (decision.action !== 'move') continue;
      const decl = declsByName.get(decision.varName);
      if (!decl) continue;
      movedDeclSnapshots.set(decision.varName, ctx.s.slice(decl.declStart, decl.declEnd));
    }
  }

  collectNeededImports(ctx);
  // Rename user-side top-level symbols that collide with injected
  // runtime names (e.g. user's `const componentQrl = …` when we need to
  // emit `import { componentQrl } from "@qwik.dev/core"`). Must run
  // AFTER collectNeededImports (we need the injected-name set) and
  // BEFORE buildQrlDeclarations (its `qrl(...)` literal text refers to
  // the injected name; user-side `qrl` is now `qrl1`).
  detectAndRenameCollisions(ctx);
  buildQrlDeclarations(ctx);
  buildInlineSCalls(ctx);
  filterUnusedImports(ctx);
  const finalCode = assembleOutput(ctx);

  return {
    code: finalCode,
    // `extractions` is the same array passed in, mutated through
    // resolveNesting + preConsolidateRawPropsCaptures + the phase-flip
    // above. Every element now has `phase: 'consolidated'`.
    extractions: extractions as ConsolidatedSegment[],
    movedDeclSnapshots,
    jsxKeyCounterValue: ctx.jsxKeyCounterValue || undefined,
  };
}

function collectExtractedCalleeNames(ctx: RewriteContext): void {
  for (const ext of ctx.extractions) {
    ctx.extractedCalleeNames.add(ext.calleeName);
    if (ext.isInlinedQrl) {
      ctx.extractedCalleeNames.add('_captures');
      ctx.extractedCalleeNames.add('_inlinedQrl');
    }
  }
  if (ctx.extractions.length > 0) {
    ctx.extractedCalleeNames.add('$');
  }
  for (const [localName] of ctx.originalImports) {
    ctx.alreadyImported.add(localName);
  }
}

function processImports(ctx: RewriteContext): void {
  const { s, program, source, extractedCalleeNames, minify, isLibMode } = ctx;

  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    const sourceNode = node.source;
    const rewrittenSource = rewriteImportSource(sourceNode.value);

    const rawSource = sourceNode.raw ?? sourceNode.value;
    const quoteChar = rawSource.startsWith("'") ? "'" : '"';

    if (!specifiers || specifiers.length === 0) {
      if (rewrittenSource !== sourceNode.value) {
        s.overwrite(sourceNode.start + 1, sourceNode.end - 1, rewrittenSource);
      }
      continue;
    }

    const toRemove: number[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      const spec = specifiers[i];
      if (spec.type !== 'ImportSpecifier') continue;
      const importedName = importedSpecifierName(spec);
      if (isMarkerSpecifier(importedName, extractedCalleeNames)) {
        // lib mode preserves the user-facing `*$`-suffix markers
        // alongside their rewritten `*Qrl` forms — downstream library
        // consumers may re-import `component$`, `useStyle$`, etc. for
        // composition or re-export. The bare `$` marker is still stripped
        // (no marker-function semantics post-extraction; SWC also strips
        // it from its lib-mode expected output).
        if (isLibMode && importedName.length > 1 && importedName.endsWith('$')) {
          continue;
        }
        toRemove.push(i);
      }
    }

    let end = node.end;
    if (end < source.length && source[end] === '\n') end++;
    s.remove(node.start, end);

    if (toRemove.length === specifiers.length) continue;

    const isQwikSource = rewrittenSource.startsWith('@qwik.dev/') ||
      rewrittenSource.startsWith('@builder.io/qwik');
    let preserveAll = false;
    if (isQwikSource && quoteChar === "'" && minify === 'none') {
      const hasNonDollarSurvivor = specifiers.some((spec: ImportDeclarationSpecifier, i: number) => {
        if (toRemove.includes(i)) return false;
        if (spec.type !== 'ImportSpecifier') return true;
        const importedName = importedSpecifierName(spec);
        return !importedName.endsWith('$');
      });
      if (hasNonDollarSurvivor) preserveAll = true;
    }

    let defaultPart = '';
    let nsPart = '';
    const namedParts: string[] = [];
    const namedPartsStructured: { local: string; imported: string }[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      if (!preserveAll && toRemove.includes(i)) continue;
      const spec = specifiers[i];
      if (spec.type === 'ImportDefaultSpecifier') {
        defaultPart = spec.local.name;
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        nsPart = `* as ${spec.local.name}`;
      } else {
        const localName = spec.local.name;
        const importedName = importedSpecifierName(spec);
        namedPartsStructured.push({ local: localName, imported: importedName });
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
      ctx.survivingUserImports.push(`import ${importParts} from ${quoteChar}${rewrittenSource}${quoteChar};`);
      ctx.survivingImportInfos.push({
        defaultPart,
        nsPart,
        namedParts: namedPartsStructured,
        quote: quoteChar,
        source: rewrittenSource,
        isSideEffect: false,
        preservedAll: preserveAll,
      });
    }
  }
}

function applyModeTransforms(ctx: RewriteContext): void {
  if (ctx.stripExports && ctx.stripExports.length > 0) {
    stripExportDeclarations(ctx.source, ctx.s, ctx.program, ctx.stripExports, ctx.originalImports);
  }
  let isDev: boolean | undefined;
  if (ctx.mode === 'dev' || ctx.mode === 'hmr') {
    isDev = true;
  } else if (ctx.mode === 'prod') {
    isDev = false;
  }
  if (ctx.isServer !== undefined || isDev !== undefined) {
    replaceConstants(ctx.source, ctx.s, ctx.program, ctx.originalImports, ctx.isServer, isDev);
  }
}

function resolveNesting(ctx: RewriteContext): void {
  const sorted = [...ctx.extractions].sort((a, b) => a.callStart - b.callStart);

  for (let i = 0; i < sorted.length; i++) {
    let bestParent: typeof sorted[0] | null = null;
    let bestRange = Infinity;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      if (
        sorted[i].callStart >= sorted[j].argStart &&
        sorted[i].callEnd <= sorted[j].argEnd
      ) {
        const range = sorted[j].argEnd - sorted[j].argStart;
        if (range < bestRange) {
          bestRange = range;
          bestParent = sorted[j];
        }
      }
    }
    if (bestParent) {
      // resolveNesting transitions captured → consolidated by setting
      // parent. Internal-builder cast (see extract.ts `Mutable<T>`) —
      // the caller treats the array as ConsolidatedSegment[] after this.
      (sorted[i] as Mutable<ConsolidatedSegment>).parent = bestParent.symbolName;
    }
  }

  for (const ext of sorted) {
    const orig = ctx.extractions.find((e) => e.symbolName === ext.symbolName);
    if (orig) (orig as Mutable<ConsolidatedSegment>).parent = ext.parent;
  }
}

function preConsolidateRawPropsCaptures(ctx: RewriteContext): void {
  if (!ctx.inlineOptions?.inline) return;

  for (const ext of ctx.extractions) {
    if (ext.parent === null || ext.captureNames.length === 0) continue;

    const parentExt = ctx.extractions.find(e => e.symbolName === ext.parent);
    if (!parentExt) continue;

    const fieldMap = extractDestructuredFieldMap(parentExt.bodyText);
    if (fieldMap.size === 0) continue;

    // Parallel defaults map so nested-segment field rewrites can emit
    // `(_rawProps.<key> ?? <default>)` for fields the parent destructure
    // defaulted (`some = 1+2`, `hey2 = 123`). Defaults-only — fields
    // without a destructure default get bare `_rawProps.<key>` from the
    // existing rewrite path.
    const fieldDefaultsMap = extractDestructuredFieldDefaultsMap(parentExt.bodyText);

    const nonPropsCaptures: string[] = [];
    let hasPropsFields = false;
    const propsFieldCaptures = new Map<string, string>();
    const propsFieldDefaults = new Map<string, string>();
    for (const name of ext.captureNames) {
      if (fieldMap.has(name)) {
        hasPropsFields = true;
        propsFieldCaptures.set(name, fieldMap.get(name)!);
        const defaultExpr = fieldDefaultsMap.get(name);
        if (defaultExpr !== undefined) {
          propsFieldDefaults.set(name, defaultExpr);
        }
      } else {
        nonPropsCaptures.push(name);
      }
    }
    if (hasPropsFields) {
      // Parent-rewrite raw-props consolidation transitions
      // captured → consolidated. Internal-builder cast (see extract.ts
      // `Mutable<T>`). After this block, ext is effectively a
      // ConsolidatedSegment from downstream's perspective.
      const wip = ext as Mutable<ConsolidatedSegment>;
      wip.propsFieldCaptures = propsFieldCaptures;
      if (propsFieldDefaults.size > 0) {
        wip.propsFieldDefaults = propsFieldDefaults;
      }
      wip.captureNames = [...nonPropsCaptures, '_rawProps'].sort();
      wip.captures = wip.captureNames.length > 0;
    }
  }
}

function preComputeQrlVarNames(ctx: RewriteContext): void {
  if (!ctx.inlineOptions) return;

  let earlyStrippedCounter = 0;
  for (const ext of ctx.extractions) {
    if (ext.isSync) continue;
    const stripped = isStrippedSegment(
      ext.ctxName, ext.ctxKind, ctx.inlineOptions.stripCtxName, ctx.inlineOptions.stripEventHandlers,
    );
    if (stripped) {
      const idx = earlyStrippedCounter++;
      const counter = 0xffff0000 + idx * 2;
      ctx.earlyQrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
    } else {
      ctx.earlyQrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
    }
  }
}

function getQrlVarName(ctx: RewriteContext, symbolName: string): string {
  return ctx.earlyQrlVarNames.get(symbolName) ?? `q_${symbolName}`;
}

function rewriteCallSites(ctx: RewriteContext): void {
  const { s, topLevel, inlineOptions } = ctx;

  for (const ext of topLevel) {
    if (ext.isSync) {
      s.overwrite(ext.callStart, ext.callEnd, buildSyncTransform(ext.bodyText));
    } else if (ext.isInlinedQrl) {
      s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ctx, ext.symbolName));
    } else if (ext.isBare) {
      s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ctx, ext.symbolName));
    } else if (isEventHandlerOrJsxProp(ext.ctxKind) && !ext.qrlCallee) {
      let propName: string;
      if (ext.isComponentEvent) {
        propName = ext.ctxName;
      } else {
        propName = transformEventPropName(ext.ctxName, new Set()) ?? ext.ctxName;
      }

      const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      let qrlRef = isRegCtx ? `serverQrl(${getQrlVarName(ctx, ext.symbolName)})` : getQrlVarName(ctx, ext.symbolName);
      if (isRegCtx) {
        const serverQrlSource = ext.importSource || '@qwik.dev/core';
        ctx.eventHandlerExtraImports.push({ sym: 'serverQrl', src: serverQrlSource });
      }

      if (!isRegCtx && ext.captureNames.length > 0) {
        qrlRef += '.w([\n        ' + ext.captureNames.join(',\n        ') + '\n    ])';
      }

      s.overwrite(ext.callStart, ext.callEnd, `${propName}={${qrlRef}}`);
    } else {
      s.overwrite(ext.calleeStart, ext.calleeEnd, ext.qrlCallee);
      s.overwrite(ext.argStart, ext.argEnd, getQrlVarName(ctx, ext.symbolName));
      if (needsPureAnnotation(ext.qrlCallee)) {
        s.prependRight(ext.callStart, '/*#__PURE__*/ ');
      }
    }
  }
}

function rewriteNoArgMarkers(ctx: RewriteContext): void {
  const { s, program, originalImports, extractedCalleeNames, alreadyImported } = ctx;
  // Typed `Set<number>` so membership checks against raw `node.start` work
  // without brand wrapping at every lookup. The ByteOffset values flow in
  // via covariance; the lookup unbrands harmlessly.
  const extractedCallStarts = new Set<number>(ctx.extractions.map(e => e.callStart));

  function walk(node: AstNode | null | undefined): void {
    if (!node) return;
    if (node.type === 'CallExpression' && !extractedCallStarts.has(node.start)) {
      const calleeName = node.callee.type === 'Identifier' ? node.callee.name : null;
      if (calleeName) {
        const importInfo = originalImports.get(calleeName);
        if (importInfo && importInfo.importedName.endsWith('$') &&
            importInfo.importedName !== '$' && importInfo.importedName !== 'sync$') {
          if (node.arguments.length === 0) {
            const qrlCallee = getQrlCalleeName(importInfo.importedName);
            s.overwrite(node.callee.start, node.callee.end, qrlCallee);
            if (needsPureAnnotation(qrlCallee)) {
              s.prependRight(node.start, '/*#__PURE__*/ ');
            }
            extractedCalleeNames.add(importInfo.importedName);
            ctx.noArgQrlCallees.push({ callee: qrlCallee, source: importInfo.source });
            if (!alreadyImported.has(qrlCallee)) {
              alreadyImported.add(qrlCallee);
            }
          }
        }
      }
    }
    forEachAstChild(node, (child) => walk(child));
  }
  for (const stmt of program.body) walk(stmt);
}

function removeUnusedBindings(ctx: RewriteContext): void {
  if (ctx.minify === 'none') return;

  const { s, source, program, topLevel, explicitExtensions, outputExtension } = ctx;

  for (const stmt of program.body) {
    if (stmt.type === 'ExportNamedDeclaration') continue;
    if (stmt.type !== 'VariableDeclaration') continue;

    const decl = stmt;
    if (!decl.declarations || decl.declarations.length !== 1) continue;

    const declarator = decl.declarations[0];
    if (!declarator.init) continue;

    const initStart = declarator.init.start;
    const initEnd = declarator.init.end;
    const matchingExtractions = topLevel.filter(
      (ext) => !ext.isSync &&
        ext.callStart >= initStart && ext.callEnd <= initEnd,
    );

    const isInlinedQrlCall = declarator.init.type === 'CallExpression' &&
      declarator.init.callee?.type === 'Identifier' &&
      declarator.init.callee.name === 'inlinedQrl';

    if (matchingExtractions.length === 0 && !isInlinedQrlCall) continue;

    const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
    if (!varName) continue;

    const wordBoundaryRegex = createRegExp(wordBoundary, exactly(varName), wordBoundary);
    let bodyText = '';
    for (const bodyStmt of program.body) {
      if (bodyStmt.type === 'ImportDeclaration') continue;
      if (bodyStmt === decl) continue;
      bodyText += source.slice(bodyStmt.start, bodyStmt.end) + '\n';
    }

    if (!wordBoundaryRegex.test(bodyText)) {
      s.remove(decl.start, initStart);
      for (const ext of matchingExtractions) {
        if (ext.isBare && ext.callStart === initStart && ext.callEnd === initEnd) {
          ctx.inlinedQrlSymbols.add(ext.symbolName);
        }
      }
    }
  }

  for (const ext of topLevel) {
    if (!ctx.inlinedQrlSymbols.has(ext.symbolName)) continue;
    const inlineExt = explicitExtensions ? (outputExtension ?? '.js') : '';
    const inlineQrl = `/*#__PURE__*/ qrl(()=>import("./${ext.canonicalFilename}${inlineExt}"), "${ext.symbolName}")`;
    s.overwrite(ext.callStart, ext.callEnd, inlineQrl);
  }
}

function removeDuplicateExports(ctx: RewriteContext): void {
  if (ctx.minify === 'none') return;

  const seenExportNames = new Set<string>();
  for (const stmt of ctx.program.body) {
    if (stmt.type !== 'ExportNamedDeclaration') continue;
    const innerDecl = stmt.declaration;
    if (!innerDecl || innerDecl.type !== 'VariableDeclaration') continue;
    if (!innerDecl.declarations || innerDecl.declarations.length !== 1) continue;

    const declarator = innerDecl.declarations[0];
    if (!declarator.init) continue;

    const exportedNames = collectBindingNamesFromPattern(declarator.id);
    if (exportedNames.length === 0) continue;

    const hasDuplicate = exportedNames.some(n => seenExportNames.has(n));
    if (hasDuplicate) {
      ctx.s.remove(stmt.start, stmt.end);
    } else {
      for (const name of exportedNames) {
        seenExportNames.add(name);
      }
    }
  }
}

function addCaptureWrapping(ctx: RewriteContext): void {
  const { s, topLevel, migrationDecisions } = ctx;

  const migratedNames = new Set(
    (migrationDecisions ?? [])
      .filter(d => d.action === 'reexport' || d.action === 'move')
      .map(d => d.varName),
  );

  for (const ext of topLevel) {
    if (ext.isSync) continue;

    if (ext.isInlinedQrl) {
      if (!ext.explicitCaptures) continue;
      const captureItems = parseArrayItems(ext.explicitCaptures);
      if (captureItems.length === 0) continue;
      const wrapVars = captureItems.join(',\n    ');
      s.appendLeft(ext.callEnd, `.w([\n    ${wrapVars}\n])`);
      continue;
    }

    if (ext.captureNames.length === 0) continue;

    if (isEventHandlerOrJsxProp(ext.ctxKind) && !ext.qrlCallee) continue;

    const effectiveCaptures = ext.captureNames.filter(name => !migratedNames.has(name));
    if (effectiveCaptures.length === 0) continue;

    const wrapVars = effectiveCaptures.join(',\n        ');
    const wText = `.w([\n        ${wrapVars}\n    ])`;

    if (ext.isBare) {
      s.appendLeft(ext.callEnd, wText);
    } else {
      s.appendLeft(ext.argEnd, wText);
    }
  }
}

function runJsxTransform(ctx: RewriteContext): void {
  if (!ctx.jsxOptions?.enableJsx) return;
  // Foreign `@jsxImportSource` pragma — leave JSX intact so
  // oxc-transform's default JSX transform handles it (it honors the
  // pragma and emits `import { jsx as _jsx } from "<pkg>/jsx-runtime"`).
  // The `<div onClick$>` syntax stays as-is; the foreign runtime treats
  // `onClick$` as an ordinary attribute name, which is what SWC produces
  // too.
  if (ctx.hasForeignJsxRuntime) return;

  const skipRanges = ctx.topLevel.map((ext) => ({
    start: ext.argStart,
    end: ext.argEnd,
  }));

  // Propagate captures from stripped event handlers to their parent JSX
  // element's `q:p` var-prop. Built INSIDE runJsxTransform (not upstream
  // in `buildElementCaptureMap`) so the positions stored here match what
  // `injectQpProp` reads during transformAllJsx's walk — both reads
  // share the same oxc raw-transfer buffer state. Cross-phase positions
  // are unreliable because every intervening `parseSync` overwrites the
  // shared buffer.
  const strippedQpOverrides = buildStrippedEventQpOverrides(ctx);

  ctx.jsxResult = transformAllJsx(
    { source: ctx.source, s: ctx.s, program: ctx.program, importedNames: ctx.jsxOptions.importedNames },
    {
      skipRanges,
      // JSX dev-info `fileName:` only switches to the user-supplied
      // dev path when explicitly set. Composed `devFilePath`
      // (srcDir+relPath fallback) keeps the default `relPath` behaviour.
      devOptions: ctx.isDevMode ? { relPath: ctx.userDevPath ?? ctx.relPath } : undefined,
      enableSignals: ctx.jsxOptions.enableSignals !== false,
      qpOverrides: strippedQpOverrides,
      relPath: ctx.relPath,
    },
  );
  ctx.jsxKeyCounterValue = ctx.jsxResult.keyCounterValue;
}

/**
 * Rewrite peer-tool `jsx()` / `jsxs()` / `jsxDEV()` calls in the parent
 * body to `_jsxSorted` / `_jsxSplit` form. Parent bodies can contain
 * plain functions producing `jsx('tag', {...})` (e.g. `Form` /
 * `ServiceWorkerRegister` factories in router fixtures) that need the
 * same rewrite segment bodies already get — `_jsxSorted` / `_wrapProp`
 * / etc. imports show up automatically alongside whatever
 * `transformAllJsx` already required.
 *
 * Runs as a sibling of `runJsxTransform`, NOT inside it, because the
 * peer-tool form is independent of JSX-syntax handling: a `.mjs`
 * extension means `ctx.jsxOptions` is undefined (`runJsxTransform`
 * short-circuits) but peer-tool `jsx()` calls still need rewriting.
 */
function runPeerToolJsxCallTransform(ctx: RewriteContext): void {
  // Foreign `@jsxImportSource` is for JSX syntax, not the peer-tool
  // form; even with a foreign pragma, a `jsx(...)` call resolving to a
  // Qwik-runtime import should still be rewritten.
  const parentJsxFunctions = collectJsxFunctionNamesFromIterable(
    ctx.originalImports.values(),
  );
  if (parentJsxFunctions.size === 0) return;

  const neededParentImports = new Set<string>();
  const parentKeyPrefix = ctx.relPath ? computeKeyPrefix(ctx.relPath) : 'u6';
  const parentKeyCounter = new JsxKeyCounter(
    ctx.jsxKeyCounterValue ?? 0,
    parentKeyPrefix,
  );
  // Skip jsx() calls inside extraction argument ranges — segment-side
  // codegen handles those, and the parent's MagicString has already replaced
  // (or scheduled replacement of) those ranges with `q_<sym>` references.
  // Reading from a replaced anchor errors out of MagicString.
  const skipRanges = ctx.extractions.map((e) => ({
    start: e.argStart,
    end: e.argEnd,
  }));
  transformJsxCalls(ctx.source, ctx.s, ctx.program, {
    jsxFunctions: parentJsxFunctions,
    keyCounter: parentKeyCounter,
    neededImports: neededParentImports,
    skipRanges,
  });
  ctx.jsxKeyCounterValue = parentKeyCounter.current();

  // Imports `transformJsxCalls` declared (`_jsxSorted`, `_wrapProp`, …) ride
  // through `collectNeededImports` alongside anything else needed. Sourced
  // from `@qwik.dev/core` — the same provenance segment-side rewriting uses.
  for (const name of neededParentImports) {
    if (!ctx.neededImports.has(name)) {
      ctx.neededImports.set(name, '@qwik.dev/core');
    }
  }
}

/**
 * Walk `ctx.program` to map each JSXElement that contains stripped
 * event handlers to the unioned capture names from those handlers.
 * Read by `injectQpProp` via the `qpOverrides` lookup at `node.start`.
 *
 * Disambiguation uses source-order consumption: a per-calleeName queue
 * of stripped extractions, dequeued as the walk encounters matching
 * `<x $attr>` attributes. Walker order matches source order (DFS into
 * children, sibling left-to-right at each level) so the queue dequeues
 * the right extraction even when the same attr name appears multiple
 * times across elements.
 */
function buildStrippedEventQpOverrides(
  ctx: RewriteContext,
): Map<number, string[]> | undefined {
  if (!ctx.inlineOptions) return undefined;
  const { stripCtxName, stripEventHandlers } = ctx.inlineOptions;
  if (!stripCtxName && !stripEventHandlers) return undefined;

  // Pre-filter stripped event extractions with captures, in source order.
  const stripByName = new Map<string, ExtractionResult[]>();
  for (const ext of ctx.extractions) {
    if (ext.ctxKind !== 'eventHandler') continue;
    if (!ext.captures || ext.captureNames.length === 0) continue;
    if (!isStrippedSegment(ext.ctxName, ext.ctxKind, stripCtxName, stripEventHandlers)) {
      continue;
    }
    const name = ext.calleeName;
    const bucket = stripByName.get(name);
    if (bucket) bucket.push(ext);
    else stripByName.set(name, [ext]);
  }
  if (stripByName.size === 0) return undefined;

  const overrides = new Map<number, string[]>();

  function walk(node: AstNode | null | undefined): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'JSXElement') {
      const attrs = node.openingElement?.attributes ?? [];
      const collectedCaps: string[] = [];
      const seen = new Set<string>();
      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute') continue;
        let attrName: string | null = null;
        if (attr.name?.type === 'JSXIdentifier') {
          attrName = attr.name.name;
        } else if (attr.name?.type === 'JSXNamespacedName') {
          attrName = `${attr.name.namespace?.name ?? ''}:${attr.name.name?.name ?? ''}`;
        }
        if (!attrName?.endsWith('$')) continue;
        const queue = stripByName.get(attrName);
        if (!queue || queue.length === 0) continue;
        const ext = queue.shift()!;
        for (const c of ext.captureNames) {
          if (!seen.has(c)) {
            seen.add(c);
            collectedCaps.push(c);
          }
        }
      }
      if (collectedCaps.length > 0) {
        overrides.set(node.start, collectedCaps);
      }
    }

    forEachAstChild(node as AstNode, (child) => walk(child as AstNode));
  }

  walk(ctx.program as unknown as AstNode);

  return overrides.size > 0 ? overrides : undefined;
}
