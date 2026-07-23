/**
 * Parent module rewriting engine.
 *
 * Output structure: [optimizer-added imports] [original non-marker imports] // [QRL const
 * declarations] // [rewritten module body] [_auto_ exports if any]
 */

import MagicString from 'magic-string';
import { createRegExp, exactly, wordBoundary } from 'magic-regexp';
import { parseSync } from 'oxc-parser';
import type { ConsolidatedSegment, ExtractionResult, Mutable } from '../extraction/extract.js';
import type { ImportInfo } from '../extraction/marker-detection.js';
import type { MigrationDecision, ModuleLevelDecl } from '../analysis/variable-migration.js';
import type { RelativePath } from '../types/brands.js';
import { rewriteImportSource } from './rewrite-imports.js';
import { buildSyncTransform, needsPureAnnotation, getQrlCalleeName } from './rewrite-calls.js';
import { isLibModePreservedMarker } from '../qwik/qrl-naming.js';
import { isEventHandlerOrJsxProp, isStrippedExtraction, matchesRegCtxName } from './predicates.js';
import { transformEventPropName } from '../jsx/event-handlers.js';
import { transformAllJsx, JsxKeyCounter, type ScopeAwareCollectResult } from '../jsx/jsx.js';
import { computeKeyPrefix } from '../jsx/key-prefix.js';
import { eventHandlerQpParams } from '../jsx/loop-hoisting.js';
import {
  collectJsxFunctionNamesFromIterable,
  transformJsxCalls,
} from '../jsx/jsx-call-transform.js';
import { stripExportDeclarations } from './strip-exports.js';
import { replaceConstants, deriveIsDev } from './const-replacement.js';
import type { EmitMode } from '../types/types.js';
import { collectBindingNamesFromPattern } from '../ast/binding-pattern.js';
import type {
  AstFunction,
  AstNode,
  AstProgram,
  ImportDeclarationSpecifier,
  ImportSpecifier,
} from '../../ast-types.js';
import { forEachAstChild } from '../ast/guards.js';
import { getJsxAttributeName } from '../jsx/jsx-attr-name.js';
import { wCallSuffix, parseArrayItems } from '../qwik/w-call.js';
import { pureAwareOverwriteStart } from '../edit/text-scanning.js';
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

export {
  resolveConstLiterals,
  resolveConstLiteralsInClosure,
  inlineConstCaptures,
  propagateConstLiteralsInBody,
} from './const-propagation.js';
export {
  extractDestructuredFieldMap,
  extractDestructuredFieldDefaultsMap,
  extractDestructuredFieldInfo,
  consolidateRawPropsInWCalls,
  applyRawPropsTransform,
  bodyConsolidatesToRawProps,
  consolidateQpCaptureValues,
  type DestructuredFieldInfo,
} from './raw-props.js';
export { transformInlineSegmentBody } from './inline-body.js';

export type { RewriteContext } from './rewrite-context.js';

import { extractDestructuredFieldInfo } from './raw-props.js';

export interface InlineStrategyOptions {
  readonly inline: boolean;
  readonly entryType?: 'inline' | 'hoist';
  readonly isLibMode?: boolean;
  readonly stripCtxName?: readonly string[];
  readonly stripEventHandlers?: boolean;
  readonly regCtxName?: readonly string[];
}

export interface ParentRewriteResult {
  /** Rewritten parent module source code. */
  code: string;
  /**
   * All extractions after `resolveNesting`, mutated in place — the same array passed to
   * {@link rewriteParentModule}, now `phase: 'consolidated'`.
   */
  extractions: ConsolidatedSegment[];
  /**
   * Post-JSX-rewrite source for each module-level decl migration will MOVE, keyed by `varName` —
   * carries the Qwik-form JSX into the segment file so it isn't re-parsed as raw source and
   * React-transformed by the TS-strip pass.
   */
  movedDeclSnapshots: Map<string, string>;
  /** Final JSX key counter value, for segment continuation. */
  jsxKeyCounterValue?: number;
}

function isMarkerSpecifier(importedName: string, extractedCalleeNames: Set<string>): boolean {
  return extractedCalleeNames.has(importedName);
}

/**
 * The imported name of a specifier. For `import { "foo" as bar }` (StringLiteral imported) falls
 * through to the local binding name.
 */
function importedSpecifierName(spec: ImportSpecifier): string {
  const imported = spec.imported;
  if (imported.type === 'Identifier') return imported.name;
  return spec.local.name;
}

function isCustomInlined(ext: ExtractionResult, originalImports: Map<string, ImportInfo>): boolean {
  for (const [, info] of originalImports) {
    if (info.importedName === ext.calleeName) return false;
  }
  return true;
}

export interface JsxRewriteOptions {
  enableJsx: boolean;
  importedNames: Set<string>;
  enableSignals?: boolean;
  precomputedScopeBindings?: ScopeAwareCollectResult;
}

/** Rewrite a parent module source using magic-string. */
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
  closureNodes?: Map<string, AstFunction>,
  userDevPath?: string,
  hasForeignJsxRuntime?: boolean
): ParentRewriteResult {
  const s = new MagicString(source);
  const program =
    existingProgram ?? parseSync(relPath, source, RAW_TRANSFER_PARSER_OPTIONS).program;

  const ctx: RewriteContext = {
    source,
    relPath,
    s,
    program,
    closureNodes,
    extractions,
    originalImports,
    migrationDecisions,
    moduleLevelDecls,
    jsxOptions,
    mode,
    devFilePath,
    userDevPath,
    inlineOptions,
    stripExports,
    isServer,
    explicitExtensions,
    transpileTs,
    minify,
    outputExtension,
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

  // Flip phase 'captured' → 'consolidated' now that resolveNesting settled the
  // last phase-spanning field (`parent`); downstream sees ConsolidatedSegment.
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

  // Slice post-JSX-rewrite text for each MOVE'd decl so its JSX reaches the
  // segment in Qwik form, not raw source that oxc-transform re-emits as `_jsx`.
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
  // Must run after collectNeededImports (needs the injected-name set) and
  // before buildQrlDeclarations (its `qrl(...)` text refers to the injected name).
  detectAndRenameCollisions(ctx);
  buildQrlDeclarations(ctx);
  buildInlineSCalls(ctx);
  filterUnusedImports(ctx);
  const finalCode = assembleOutput(ctx);

  return {
    code: finalCode,
    extractions: extractions as ConsolidatedSegment[],
    movedDeclSnapshots,
    jsxKeyCounterValue: ctx.jsxKeyCounterValue || undefined,
  };
}

function collectExtractedCalleeNames(ctx: RewriteContext): void {
  for (const ext of ctx.extractions) {
    ctx.extractedCalleeNames.add(ext.calleeName);
    if (ext.isInlinedQrl) {
      // `_captures` is a runtime helper used inside inlinedQrl bodies, not a
      // marker callee. Stripping its import is only safe when bodies extract to
      // segment files; under inline/hoist they stay in the parent and still need it.
      if (!ctx.isInline) {
        ctx.extractedCalleeNames.add('_captures');
      }
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
        if (isLibMode && isLibModePreservedMarker(importedName)) {
          continue;
        }
        toRemove.push(i);
      }
    }

    let end = node.end;
    if (end < source.length && source[end] === '\n') end++;
    s.remove(node.start, end);

    if (toRemove.length === specifiers.length) continue;

    const isQwikSource =
      rewrittenSource.startsWith('@qwik.dev/') || rewrittenSource.startsWith('@builder.io/qwik');
    let preserveAll = false;
    if (isQwikSource && quoteChar === "'" && minify === 'none') {
      const hasNonDollarSurvivor = specifiers.some(
        (spec: ImportDeclarationSpecifier, i: number) => {
          if (toRemove.includes(i)) return false;
          if (spec.type !== 'ImportSpecifier') return true;
          const importedName = importedSpecifierName(spec);
          return !importedName.endsWith('$');
        }
      );
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
      ctx.survivingUserImports.push(
        `import ${importParts} from ${quoteChar}${rewrittenSource}${quoteChar};`
      );
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
    stripExportDeclarations(ctx.s, ctx.program, ctx.stripExports);
  }
  const isDev = deriveIsDev(ctx.mode);
  if (ctx.isServer !== undefined || isDev !== undefined) {
    replaceConstants(ctx.s, ctx.program, ctx.originalImports, ctx.isServer, isDev);
  }
}

function resolveNesting(ctx: RewriteContext): void {
  const sorted = [...ctx.extractions].sort((a, b) => a.callStart - b.callStart);

  for (let i = 0; i < sorted.length; i++) {
    let bestParent: (typeof sorted)[0] | null = null;
    let bestRange = Infinity;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      if (sorted[i].callStart >= sorted[j].argStart && sorted[i].callEnd <= sorted[j].argEnd) {
        const range = sorted[j].argEnd - sorted[j].argStart;
        if (range < bestRange) {
          bestRange = range;
          bestParent = sorted[j];
        }
      }
    }
    if (bestParent) {
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

    const parentExt = ctx.extractions.find((e) => e.symbolName === ext.parent);
    if (!parentExt) continue;

    // Defaults let nested-segment field rewrites emit `(_rawProps.<key> ?? <default>)`
    // for fields the parent destructure defaulted; undefaulted fields stay bare.
    const { fieldMap, fieldDefaults: fieldDefaultsMap } = extractDestructuredFieldInfo(
      parentExt.bodyText
    );
    if (fieldMap.size === 0) continue;

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
    const stripped = isStrippedExtraction(
      ext,
      ctx.inlineOptions.stripCtxName,
      ctx.inlineOptions.stripEventHandlers
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
      s.overwrite(
        pureAwareOverwriteStart(ctx.source, ext.callStart),
        ext.callEnd,
        getQrlVarName(ctx, ext.symbolName)
      );
    } else if (ext.isBare) {
      // Consume any preceding PURE annotation so it isn't stranded before the
      // `q_<symbol>` identifier.
      s.overwrite(
        pureAwareOverwriteStart(ctx.source, ext.callStart),
        ext.callEnd,
        getQrlVarName(ctx, ext.symbolName)
      );
    } else if (isEventHandlerOrJsxProp(ext.ctxKind) && !ext.qrlCallee) {
      let propName: string;
      if (ext.isComponentEvent) {
        propName = ext.ctxName;
      } else {
        propName = transformEventPropName(ext.ctxName, new Set()) ?? ext.ctxName;
      }

      const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
      let qrlRef = isRegCtx
        ? `serverQrl(${getQrlVarName(ctx, ext.symbolName)})`
        : getQrlVarName(ctx, ext.symbolName);
      if (isRegCtx) {
        const serverQrlSource = ext.importSource || '@qwik.dev/core';
        ctx.eventHandlerExtraImports.push({ sym: 'serverQrl', src: serverQrlSource });
      }

      if (!isRegCtx && ext.captureNames.length > 0) {
        qrlRef += wCallSuffix(ext.captureNames, '        ', '    ');
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
  const extractedCallStarts = new Set<number>(ctx.extractions.map((e) => e.callStart));

  function walk(node: AstNode | null | undefined): void {
    if (!node) return;
    if (node.type === 'CallExpression' && !extractedCallStarts.has(node.start)) {
      const calleeName = node.callee.type === 'Identifier' ? node.callee.name : null;
      if (calleeName) {
        const importInfo = originalImports.get(calleeName);
        if (
          importInfo &&
          importInfo.importedName.endsWith('$') &&
          importInfo.importedName !== '$' &&
          importInfo.importedName !== 'sync$'
        ) {
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

  // Reexported bindings (`export { X as _auto_X }`) MUST survive even when they
  // look unused here: the reexport is appended after this pass (not in the scan
  // below), so stripping the binding would leave the reexport dangling.
  const reexportedNames = new Set(
    (ctx.migrationDecisions ?? []).filter((d) => d.action === 'reexport').map((d) => d.varName)
  );

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
      (ext) => !ext.isSync && ext.callStart >= initStart && ext.callEnd <= initEnd
    );

    const isInlinedQrlCall =
      declarator.init.type === 'CallExpression' &&
      declarator.init.callee?.type === 'Identifier' &&
      declarator.init.callee.name === 'inlinedQrl';

    if (matchingExtractions.length === 0 && !isInlinedQrlCall) continue;

    const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
    if (!varName) continue;
    if (reexportedNames.has(varName)) continue;

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

    const hasDuplicate = exportedNames.some((n) => seenExportNames.has(n));
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
      .filter((d) => d.action === 'reexport' || d.action === 'move')
      .map((d) => d.varName)
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

    const effectiveCaptures = ext.captureNames.filter((name) => !migratedNames.has(name));
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
  // Foreign `@jsxImportSource` pragma — leave JSX intact so oxc-transform's
  // default JSX transform handles it via the pragma-named runtime.
  if (ctx.hasForeignJsxRuntime) return;

  const skipRanges = ctx.topLevel.map((ext) => ({
    start: ext.argStart,
    end: ext.argEnd,
  }));

  // Built here (not upstream) so stored positions match what `injectQpProp`
  // reads during the same transformAllJsx walk — a later parseSync overwrites
  // the shared oxc raw-transfer buffer, invalidating cross-phase positions.
  const strippedQpOverrides = buildStrippedEventQpOverrides(ctx);

  ctx.jsxResult = transformAllJsx(
    {
      source: ctx.source,
      s: ctx.s,
      program: ctx.program,
      importedNames: ctx.jsxOptions.importedNames,
    },
    {
      skipRanges,
      // JSX dev-info `fileName:` switches to the user dev path only when
      // explicitly set; otherwise keep `relPath`.
      devOptions: ctx.isDevMode ? { relPath: ctx.userDevPath ?? ctx.relPath } : undefined,
      enableSignals: ctx.jsxOptions.enableSignals !== false,
      qpOverrides: strippedQpOverrides,
      relPath: ctx.relPath,
      precomputedScopeBindings: ctx.jsxOptions.precomputedScopeBindings,
    }
  );
  ctx.jsxKeyCounterValue = ctx.jsxResult.keyCounterValue;
}

/**
 * Rewrite peer-tool `jsx()`/`jsxs()`/`jsxDEV()` calls in the parent body to
 * `_jsxSorted`/`_jsxSplit` form. Runs as a sibling of `runJsxTransform`, not inside it: a `.mjs`
 * extension leaves `ctx.jsxOptions` undefined (so `runJsxTransform` short-circuits) but peer-tool
 * `jsx()` calls still rewrite.
 */
function runPeerToolJsxCallTransform(ctx: RewriteContext): void {
  // Foreign `@jsxImportSource` governs JSX syntax, not the peer-tool form: a
  // `jsx(...)` resolving to a Qwik-runtime import still rewrites.
  const parentJsxFunctions = collectJsxFunctionNamesFromIterable(ctx.originalImports.values());
  if (parentJsxFunctions.size === 0) return;

  const neededParentImports = new Set<string>();
  const parentKeyPrefix = ctx.relPath ? computeKeyPrefix(ctx.relPath) : 'u6';
  const parentKeyCounter = new JsxKeyCounter(ctx.jsxKeyCounterValue ?? 0, parentKeyPrefix);
  // Skip jsx() inside extraction arg ranges: segment codegen handles those and
  // the parent MagicString already replaced them — reading a replaced anchor throws.
  const skipRanges = ctx.extractions.map((e) => ({
    start: e.argStart,
    end: e.argEnd,
  }));
  // Map each event handler's parent-side QRL var to its capture params so the
  // peer-tool rewriter injects the owning element's `q:p`/`q:ps` prop — needed
  // for client resumption even when the handler body stays inline or is stripped.
  const qpByQrl = new Map<string, string[]>();
  for (const ext of ctx.extractions) {
    if (ext.ctxKind !== 'eventHandler' && ext.ctxKind !== 'jSXProp') continue;
    const params = eventHandlerQpParams(ext.paramNames);
    if (params.length > 0) qpByQrl.set(getQrlVarName(ctx, ext.symbolName), params);
  }
  transformJsxCalls(ctx.source, ctx.s, ctx.program, {
    jsxFunctions: parentJsxFunctions,
    keyCounter: parentKeyCounter,
    neededImports: neededParentImports,
    skipRanges,
    qpByQrl: qpByQrl.size > 0 ? qpByQrl : undefined,
  });
  ctx.jsxKeyCounterValue = parentKeyCounter.current();

  for (const name of neededParentImports) {
    if (!ctx.neededImports.has(name)) {
      ctx.neededImports.set(name, '@qwik.dev/core');
    }
  }
}

/**
 * Map each JSXElement containing stripped event handlers to the union of their capture names, read
 * by `injectQpProp` at `node.start`. Disambiguates same-named attrs by dequeuing a per-calleeName
 * queue in source (walk) order.
 */
function buildStrippedEventQpOverrides(ctx: RewriteContext): Map<number, string[]> | undefined {
  if (!ctx.inlineOptions) return undefined;
  const { stripCtxName, stripEventHandlers } = ctx.inlineOptions;
  if (!stripCtxName && !stripEventHandlers) return undefined;

  const stripByName = new Map<string, ExtractionResult[]>();
  for (const ext of ctx.extractions) {
    if (ext.ctxKind !== 'eventHandler') continue;
    if (!ext.captures || ext.captureNames.length === 0) continue;
    if (!isStrippedExtraction(ext, stripCtxName, stripEventHandlers)) {
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
        const attrName = getJsxAttributeName(attr);
        if (!attrName.endsWith('$')) continue;
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
