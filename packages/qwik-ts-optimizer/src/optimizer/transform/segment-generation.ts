/**
 * Segment module generation phase for the Qwik optimizer.
 *
 * Generates TransformModule entries for each extracted segment,
 * including code generation, metadata, and import context assembly.
 */

import { walk } from "oxc-walker";
import type {
  AstNode,
  AstProgram,
  TSEnumDeclaration,
} from "../../ast-types.js";
import type { ConsolidatedSegment, ExtractionResult, Mutable } from "../extract.js";
import type { ImportInfo } from "../marker-detection.js";
import type { MigrationDecision, ModuleLevelDecl } from "../variable-migration.js";
import type {
  TransformModule,
  SegmentMetadataInternal,
  TransformModulesOptions,
  EntryStrategy,
} from "../types.js";
import { hasManualEntryMap } from "../types.js";
import {
  generateSegmentCode,
  type SegmentCaptureInfo,
  type NestedCallSiteInfo,
  type SegmentImportData,
} from "../segment-codegen.js";
import { resolveEntryField } from "../entry-strategy.js";
import { buildQrlDeclaration } from "../rewrite-calls.js";
import { getQrlCalleeName } from "../utils/qrl-naming.js";
import { buildQrlDevDeclaration } from "../dev-mode.js";
import { generateStrippedSegmentCode } from "../strip-ctx.js";
import { isStrippedSegment } from "../rewrite/predicates.js";
import { mkByteOffset, mkRelativePath } from "../types/brands.js";
import {
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  getSentinelCounter,
} from "../inline-strategy.js";
import { transformEventPropName } from "./event-handlers.js";
import {
  extractDestructuredFieldMap,
  extractDestructuredFieldDefaultsMap,
} from "../rewrite/index.js";
import { collectSameFileSymbolInfo } from "../utils/module-symbols.js";
import { rewriteImportSource } from "../rewrite-imports.js";
import { parseWithRawTransfer } from "../utils/parse.js";
import { forEachAstChild } from "../utils/ast.js";
import {
  leadingDot,
  numberedPaddingParam,
  paddingParam,
  resolveCaptureInfo,
  postProcessSegmentCode,
} from "./post-process.js";
import type { LoopContext } from "../loop-hoisting.js";

/** Collect TS enum declarations for value inlining in segment bodies. */
export function collectEnumValueMap(
  program: AstProgram,
  shouldTranspileTs: boolean,
): Map<string, Map<string, string>> {
  const enumValueMap = new Map<string, Map<string, string>>();
  if (!shouldTranspileTs) return enumValueMap;

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
    if (enumDecl && enumDecl.id?.name && enumDecl.body?.members) {
      const members = new Map<string, string>();
      let autoValue = 0;
      for (const member of enumDecl.body.members) {
        const memberName =
          member.id.type === "Identifier"
            ? member.id.name
            : member.id.type === "Literal" && typeof member.id.value === "string"
              ? member.id.value
              : null;
        if (!memberName) continue;
        if (member.initializer) {
          // Explicit initializer -- extract literal value
          if (member.initializer.type === "Literal" && typeof member.initializer.value === "number") {
            const val = String(member.initializer.value);
            members.set(memberName, val);
            autoValue = Number(member.initializer.value) + 1;
          } else if (
            member.initializer.type === "Literal" &&
            typeof member.initializer.value === "string"
          ) {
            members.set(
              memberName,
              JSON.stringify(member.initializer.value),
            );
            autoValue = NaN; // String enums break auto-increment
          } else {
            // Complex initializer -- skip inlining for this member
            autoValue = NaN;
          }
        } else {
          // Auto-incremented value
          members.set(memberName, String(autoValue));
          autoValue++;
        }
      }
      if (members.size > 0) {
        enumValueMap.set(enumDecl.id.name, members);
      }
    }
  }
  return enumValueMap;
}

/** Collect import attributes from AST (e.g., with { type: "json" }). */
export function collectImportAttributes(
  program: AstProgram,
): Map<string, Record<string, string>> {
  const importAttributesMap = new Map<string, Record<string, string>>();
  for (const node of program.body) {
    if (node.type !== "ImportDeclaration") continue;
    const attrs = node.attributes;
    if (attrs && attrs.length > 0) {
      const attrObj: Record<string, string> = {};
      for (const attr of attrs) {
        const key =
          attr.key?.type === "Identifier" ? attr.key.name : attr.key?.value;
        const value = attr.value?.value;
        if (key && value) attrObj[key] = value;
      }
      // Associate with each specifier's local name
      for (const spec of node.specifiers) {
        const localName = spec.local?.name;
        if (localName) {
          importAttributesMap.set(localName, attrObj);
        }
      }
    }
  }
  return importAttributesMap;
}

/** Build the segment import list used during import resolution. */
export function buildSegmentImportList(
  originalImports: Map<string, ImportInfo>,
  importAttributesMap: Map<string, Record<string, string>>,
): SegmentImportData["moduleImports"] {
  const segmentImportList: SegmentImportData["moduleImports"] = [];
  const addedModuleImports = new Set<string>();
  for (const [, imp] of originalImports) {
    segmentImportList.push({
      localName: imp.localName,
      importedName: imp.importedName,
      source: imp.source,
      importAttributes: importAttributesMap.get(imp.localName),
    });
    addedModuleImports.add(imp.localName);
  }

  // Also include optimizer-injected runtime imports (qrl, componentQrl, etc.)
  // that the parent module uses but weren't in the original source imports.
  // These are needed so segment post-transform import scanning can find them.
  const runtimeImports = [
    "qrl",
    "qrlDEV",
    "componentQrl",
    "_noopQrl",
    "_noopQrlDEV",
    "_qrlSync",
    "_captures",
    "_jsxSorted",
    "_jsxSplit",
    "_fnSignal",
    "_wrapProp",
    "_restProps",
    "_getVarProps",
    "_getConstProps",
    "_regSymbol",
    "_useHmr",
    "serverQrl",
    "serverLoaderQrl",
    "serverStuffQrl",
    "serverActionQrl",
    "useTaskQrl",
    "useStyleQrl",
    "useStylesQrl",
    "useClientMountQrl",
    "formActionQrl",
    "useServerMountQrl",
    "inlinedQrl",
  ];
  for (const name of runtimeImports) {
    if (!addedModuleImports.has(name)) {
      segmentImportList.push({
        localName: name,
        importedName: name,
        source: "@qwik.dev/core",
      });
    }
  }

  return segmentImportList;
}

export interface SegmentGenerationContext {
  extractions: ConsolidatedSegment[];
  updatedExtractions: ConsolidatedSegment[];
  program: AstProgram;
  originalImports: Map<string, ImportInfo>;
  options: TransformModulesOptions;
  repairedCode: string;
  relPath: string;
  emitMode: string;
  devFile: string | undefined;
  /**
   * Raw user-supplied `input.devPath`. Distinguished from `devFile` (which
   * always falls back to a composed path); JSX dev-info `fileName:` only
   * honors the explicit override. See OSS-428.
   */
  userDevPath: string | undefined;
  isInlineStrategy: boolean;
  entryStrategy: EntryStrategy;
  migrationDecisions: MigrationDecision[];
  moduleLevelDecls: ModuleLevelDecl[];
  moduleLevelDeclsByName: Map<string, ModuleLevelDecl>;
  /**
   * Per-varName post-JSX-rewrite source text for MOVE-target decls. The
   * parent rewrite captures these post-`runJsxTransform` (pre-assembly)
   * so JSX inside a moved helper function (e.g. `function Hola(props) {
   * return <div {...props}/>; }`) carries the rewritten Qwik form into
   * the segment file. Without this, the raw source survives the move and
   * oxc-transform's TS-strip pass emits React `_jsx(...)` instead. OSS-430.
   */
  movedDeclSnapshots: Map<string, string>;
  segmentUsage: Map<string, Set<string>>;
  parentModulePath: string;
  preRenameSymbolName: Map<string, string>;
  qrlOutputExt: string | undefined;
  sourceExtensions: Map<string, string>;
  /**
   * OSS-443: the parent input file's extension. Threaded to
   * `postProcessSegmentCode` so oxc-transform's TS-strip / JSX-strip
   * parses the segment body in the source dialect (the segment's own
   * `extension` is often downgraded to `.js` even when the body
   * contains TS or JSX).
   */
  parentSourceExt: string;
  shouldTranspileJsx: boolean;
  shouldTranspileTs: boolean;
  isJsx: boolean;
  importedNames: Set<string>;
  enclosingExtMap: Map<string, ExtractionResult>;
  elementQpParamsMap: Map<string, string[]>;
  extractionLoopMap: Map<string, LoopContext[]>;
  constLiteralsMap: Map<string, Map<string, string>>;
  parentJsxKeyCounterValue: number;
  /**
   * OSS-431: source carries `/* @jsxImportSource <non-qwik-pkg> *‌/`. When
   * true, segment-codegen skips Qwik's JSX-syntax rewrite and prepends
   * `foreignJsxPragmaText` to each segment file so oxc-transform's default
   * JSX transform (run by `postProcessSegmentCode`) honors the pragma.
   */
  hasForeignJsxRuntime: boolean;
  foreignJsxPragmaText: string | null;
}

/**
 * Immutable per-call setup data produced once before the per-extraction loop
 * in {@link generateAllSegmentModules}. All fields are read-only across the
 * loop body; producing them up-front means the per-extraction code has no
 * setup-time side effects to reason about.
 *
 * Note: `sortedExtractions` is the same reference as `ctx.updatedExtractions`,
 * which {@link computeSegmentGenerationPrep} sorts in place (children before
 * parents). Treat it as logically immutable inside the loop.
 */
export interface SegmentGenerationPrep {
  /**
   * All fields below are *intended* read-only across the per-extraction loop.
   * Types stay mutable to match downstream signatures (`SegmentImportData`,
   * `generateSegmentCode`) without forcing readonly-cast plumbing through them.
   */
  extBySymbol: Map<string, ConsolidatedSegment>;
  sortedExtractions: ConsolidatedSegment[];
  sameFileSymbols: Set<string>;
  defaultExportedNames: Set<string>;
  renamedExports: Map<string, string>;
  segmentImportList: SegmentImportData["moduleImports"];
  enumValueMap: Map<string, Map<string, string>>;
  fieldMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /**
   * OSS-409 bug 2: parallel to `fieldMaps` — for each parent symbol, the
   * destructure-time default expressions keyed by local-binding name.
   * Empty inner map means no defaults; consumers should fall through to
   * bare `_rawProps.<key>` accessors.
   */
  fieldDefaultsMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/**
 * Result of {@link consolidateRawPropsCaptures}. Returned (vs in-place
 * mutation) so the caller can decide which surface to write to — the
 * inline-strategy path writes to `ext.propsFieldCaptures`, the default-strategy
 * path writes to `captureInfo.propsFieldCaptures`. Both paths additionally
 * mutate `ext.captureNames` and `ext.captures`.
 */
export interface RawPropsConsolidation {
  propsFieldCaptures: Map<string, string>;
  /** Sorted; includes the literal `"_rawProps"` sentinel. */
  newCaptureNames: string[];
  /**
   * OSS-409 bug 2: per-field destructure-time defaults for captures
   * that resolved to a defaulted prop on the parent. Used downstream
   * by raw-props body rewriting to emit `(_rawProps.<key> ?? <default>)`.
   * Undefined / empty when no defaults apply.
   */
  propsFieldDefaults?: Map<string, string>;
}

/**
 * Partition an extraction's `captureNames` into a `propsFieldCaptures` map
 * (the names that resolve to a destructured field on the parent's first
 * argument) and a `_rawProps`-suffixed sorted array (the remaining captures
 * plus the `_rawProps` sentinel for the runtime). Returns `null` when no
 * captures resolve to props fields — the caller leaves `ext` untouched in
 * that case.
 *
 * Shared between the inline-strategy metadata path and the default-strategy
 * codegen path; identical algorithm in both, only the write surfaces differ.
 */
export function consolidateRawPropsCaptures(
  captureNames: readonly string[],
  fieldMap: ReadonlyMap<string, string>,
  fieldDefaults?: ReadonlyMap<string, string>,
): RawPropsConsolidation | null {
  const propsFieldCaptures = new Map<string, string>();
  const propsFieldDefaults = new Map<string, string>();
  const nonPropsCaptures: string[] = [];
  for (const name of captureNames) {
    const fieldExpr = fieldMap.get(name);
    if (fieldExpr !== undefined) {
      propsFieldCaptures.set(name, fieldExpr);
      const defaultExpr = fieldDefaults?.get(name);
      if (defaultExpr !== undefined) propsFieldDefaults.set(name, defaultExpr);
    } else {
      nonPropsCaptures.push(name);
    }
  }
  if (propsFieldCaptures.size === 0) return null;
  return {
    propsFieldCaptures,
    newCaptureNames: [...nonPropsCaptures, "_rawProps"].sort(),
    propsFieldDefaults: propsFieldDefaults.size > 0 ? propsFieldDefaults : undefined,
  };
}

/**
 * Compute the {@link SegmentGenerationPrep} record consumed by the per-extraction
 * loop in {@link generateAllSegmentModules}. Folds the eight setup steps
 * (extBySymbol, depth-sort, same-file symbol triple, segmentImportList,
 * enumValueMap, fieldMaps) into a single immutable record so the loop body
 * has no setup-time side effects to reason about.
 *
 * Mutates `ctx.updatedExtractions` in place to depth-sort children before
 * parents (preserved verbatim from the pre-OSS-356 inline form).
 */
export function computeSegmentGenerationPrep(
  ctx: SegmentGenerationContext,
): SegmentGenerationPrep {
  // Build O(1) lookup map for extractions by symbolName.
  const extBySymbol = new Map<string, ConsolidatedSegment>();
  for (const ext of ctx.updatedExtractions) {
    extBySymbol.set(ext.symbolName, ext);
  }

  // Sort extractions so children are processed before parents
  // (depth-first, leaves first).
  const extractionDepth = new Map<string, number>();
  for (const ext of ctx.updatedExtractions) {
    let depth = 0;
    let current = ext.parent;
    while (current) {
      depth++;
      const parentExt = extBySymbol.get(current);
      current = parentExt?.parent ?? null;
    }
    extractionDepth.set(ext.symbolName, depth);
  }
  ctx.updatedExtractions.sort((a, b) => {
    const da = extractionDepth.get(a.symbolName) ?? 0;
    const db = extractionDepth.get(b.symbolName) ?? 0;
    return db - da;
  });

  // Collect same-file exported/declared names for self-referential segment imports.
  const { sameFileSymbols, defaultExportedNames, renamedExports } =
    collectSameFileSymbolInfo(ctx.program);

  // Collect import attributes and build module imports context.
  const importAttributesMap = collectImportAttributes(ctx.program);
  const segmentImportList = buildSegmentImportList(
    ctx.originalImports,
    importAttributesMap,
  );

  // Collect TS enum declarations for value inlining.
  const enumValueMap = collectEnumValueMap(ctx.program, ctx.shouldTranspileTs);

  // Pre-compute destructured field maps for every parent that an extraction
  // references. Replaces a closure-mutated lazy cache with an immutable
  // lookup so the per-extraction loop has no side-effecting state.
  // (OSS-345 introduced the immutable form; OSS-356 hoists it into Prep.)
  // ReadonlyMap stays narrower than the rest of Prep because nothing
  // downstream needs Map-mutating methods on this one.
  const fieldMaps: ReadonlyMap<string, ReadonlyMap<string, string>> = (() => {
    const parentSymbolNames = new Set<string>();
    for (const ext of ctx.updatedExtractions) {
      if (ext.parent !== null) parentSymbolNames.add(ext.parent);
    }
    const result = new Map<string, ReadonlyMap<string, string>>();
    for (const symbolName of parentSymbolNames) {
      const parentExt = extBySymbol.get(symbolName);
      if (parentExt !== undefined) {
        result.set(
          symbolName,
          extractDestructuredFieldMap(parentExt.bodyText),
        );
      }
    }
    return result;
  })();

  // OSS-409 bug 2: parallel defaults map (parent symbol → local → default expr).
  // Used by raw-props consolidation in inline + default strategies to emit
  // `(_rawProps.<key> ?? <default>)` for defaulted fields in nested segments.
  const fieldDefaultsMaps: ReadonlyMap<string, ReadonlyMap<string, string>> = (() => {
    const parentSymbolNames = new Set<string>();
    for (const ext of ctx.updatedExtractions) {
      if (ext.parent !== null) parentSymbolNames.add(ext.parent);
    }
    const result = new Map<string, ReadonlyMap<string, string>>();
    for (const symbolName of parentSymbolNames) {
      const parentExt = extBySymbol.get(symbolName);
      if (parentExt !== undefined) {
        result.set(
          symbolName,
          extractDestructuredFieldDefaultsMap(parentExt.bodyText),
        );
      }
    }
    return result;
  })();

  return {
    extBySymbol,
    sortedExtractions: ctx.updatedExtractions,
    sameFileSymbols,
    defaultExportedNames,
    renamedExports,
    segmentImportList,
    enumValueMap,
    fieldMaps,
    fieldDefaultsMaps,
  };
}

/**
 * Build a single inline-strategy {@link TransformModule}. Inline/hoist
 * entry strategies emit segment bodies inside the parent module rather
 * than as separate files.
 *
 * Returns `null` for non-stripped extractions — their body is inlined
 * into the parent and no per-segment file should land on disk (OSS-425
 * mirrors SWC, which emits no segment file in that case). Stripped
 * extractions still get their own file holding the `export const X = null`
 * stub the runtime resolver expects when a stripped QRL is referenced.
 *
 * Mutates `ext.captureNames`, `ext.captures`, and `ext.propsFieldCaptures`
 * when raw-props consolidation applies — preserved verbatim from the
 * pre-OSS-356 inline form. Mutation runs unconditionally because the
 * consolidated capture metadata is also consumed by the parent's inlined
 * `q_X.s(body)` emission.
 */
export function buildInlineStrategySegment(
  ext: ConsolidatedSegment,
  ctx: SegmentGenerationContext,
  prep: SegmentGenerationPrep,
  stripped: boolean,
): TransformModule | null {
  // Inline strategy: apply _rawProps consolidation for metadata
  if (ext.parent !== null && ext.captureNames.length > 0) {
    const fieldMap = prep.fieldMaps.get(ext.parent);
    if (fieldMap !== undefined && fieldMap.size > 0) {
      const fieldDefaults = prep.fieldDefaultsMaps.get(ext.parent);
      const result = consolidateRawPropsCaptures(ext.captureNames, fieldMap, fieldDefaults);
      if (result !== null) {
        ext.propsFieldCaptures = result.propsFieldCaptures;
        if (result.propsFieldDefaults !== undefined) {
          ext.propsFieldDefaults = result.propsFieldDefaults;
        }
        ext.captureNames = result.newCaptureNames;
        ext.captures = result.newCaptureNames.length > 0;
      }
    }
  }

  const entryField = resolveEntryField(
    ctx.entryStrategy.type,
    ext.symbolName,
    ext.ctxName,
    null,
    undefined,
  );

  // OSS-425: non-stripped inline-strategy extractions emit no segment file.
  // Their body lives in the parent via `q_X.s(body)`; SWC's reference emits
  // no companion file. Only stripped extractions ship the `= null` stub
  // file the runtime resolver still needs to load.
  if (!stripped) return null;

  const segmentAnalysis: SegmentMetadataInternal = {
    origin: ext.origin,
    name: ext.symbolName,
    entry: entryField,
    displayName: ext.displayName,
    hash: ext.hash,
    canonicalFilename: ext.canonicalFilename,
    extension: ext.extension.replace(leadingDot, ""),
    parent: ext.parent,
    ctxKind: ext.ctxKind,
    ctxName: ext.ctxName,
    captures: ext.captures,
    loc: ext.loc,
    captureNames: ext.captureNames,
    paramNames: ext.paramNames,
  };

  return {
    kind: 'segment',
    path: mkRelativePath(ext.canonicalFilename + ext.extension),
    isEntry: true,
    code: generateStrippedSegmentCode(ext.symbolName),
    map: null,
    segment: segmentAnalysis,
  };
}

/**
 * Build the per-child QRL declaration strings (one per non-sync child of
 * `ext`). Each child becomes either a `_noopQrl(...)` / `_noopQrlDEV(...)`
 * declaration (when stripped) or a `qrl(...)` / `qrlDEV(...)` declaration.
 *
 * Returns the declaration strings paired with `childQrlVarNames`, the map
 * from `child.symbolName → q_<name>` (or `q_qrl_<sentinel>` for stripped
 * children) that downstream consumers (e.g. {@link buildNestedCallSites})
 * use to refer to the child's QRL.
 *
 * Stripped-segment indexing is per-call (each call to this helper has its
 * own `strippedIdx` counter via {@link getSentinelCounter}).
 */
export function buildNestedQrlDeclarations(
  children: ConsolidatedSegment[],
  options: TransformModulesOptions,
  isDevMode: boolean,
  devFile: string | undefined,
  qrlOutputExt: string | undefined,
): {
  nestedQrlDecls: string[];
  childQrlVarNames: Map<string, string>;
} {
  let strippedIdx = 0;
  const childQrlVarNames = new Map<string, string>();
  const nestedQrlDecls = children.map((child) => {
    const childStripped = isStrippedSegment(
      child.ctxName,
      child.ctxKind,
      options.stripCtxName,
      options.stripEventHandlers,
    );
    if (childStripped) {
      const idx = strippedIdx++;
      const counter = getSentinelCounter(idx);
      childQrlVarNames.set(child.symbolName, `q_qrl_${counter}`);
      if (isDevMode && devFile) {
        return buildStrippedNoopQrlDev(child.symbolName, idx, {
          file: devFile,
          lo: 0,
          hi: 0,
          displayName: child.displayName,
        });
      }
      return buildStrippedNoopQrl(child.symbolName, idx);
    }
    childQrlVarNames.set(child.symbolName, `q_${child.symbolName}`);
    if (isDevMode && devFile) {
      const devExt = options.explicitExtensions
        ? (qrlOutputExt ?? ".js")
        : undefined;
      return buildQrlDevDeclaration(
        child.symbolName,
        child.canonicalFilename,
        devFile,
        child.loc[0],
        child.loc[1],
        child.displayName,
        devExt,
      );
    }
    return buildQrlDeclaration(
      child.symbolName,
      child.canonicalFilename,
      options.explicitExtensions,
      child.extension,
      qrlOutputExt,
    );
  });
  return { nestedQrlDecls, childQrlVarNames };
}

/**
 * When a single-segment marker-call decl (`const X = component$(() => ...)`)
 * is `move`d into a sibling segment's file, the raw source text would
 * re-emit the marker call and its closure body — duplicating the body that
 * was already extracted into its own segment file. Instead, synthesize the
 * parent-rewrite-equivalent pair so the moved decl behaves like every other
 * marker-call binding in the codebase: a qrl ref for the extracted body
 * followed by a `componentQrl(q_<symbol>)`-style wrap.
 *
 * Returns `null` when the decl's initializer isn't a marker call, or when no
 * top-level extraction is found inside its source range (which would mean
 * the marker body wasn't extracted — extraction failure, not our concern).
 */
function tryBuildMarkerDeclMove(
  decl: ModuleLevelDecl,
  extractions: readonly ConsolidatedSegment[],
  relPath: string,
  options: TransformModulesOptions,
  qrlOutputExt: string | undefined,
  sourceExtensions: Map<string, string>,
): { qrlDecl: string; wrapDecl: string } | null {
  // Match the decl to its top-level marker-call extraction by displayName.
  // Format is `<fileStem>_<declName>(_<marker>...)` per `naming.ts`; positional
  // matching via `ext.loc` doesn't work here because `loc` is stored as
  // `[line, col]`, not the `[start, end]` byte range surfaced in snapshots.
  const fileStem = relPath.split("/").pop() ?? relPath;
  const exactDisplayName = `${fileStem}_${decl.name}`;
  const prefixDisplayName = `${exactDisplayName}_`;
  let match: ConsolidatedSegment | null = null;
  for (const ext of extractions) {
    if (ext.parent !== null) continue;
    if (ext.isInlinedQrl) continue;
    if (
      ext.displayName === exactDisplayName ||
      ext.displayName.startsWith(prefixDisplayName)
    ) {
      match = ext;
      break;
    }
  }
  if (!match) return null;
  const qrlCallee = getQrlCalleeName(match.ctxName);
  if (!qrlCallee) return null;
  const outputExt =
    qrlOutputExt ?? sourceExtensions.get(match.symbolName) ?? match.extension;
  const qrlDecl = buildQrlDeclaration(
    match.symbolName,
    match.canonicalFilename,
    options.explicitExtensions,
    match.extension,
    outputExt,
  );
  const wrapDecl = `const ${decl.name} = /*#__PURE__*/ ${qrlCallee}(q_${match.symbolName});`;
  return { qrlDecl, wrapDecl };
}

/**
 * Wire migration data (auto-imports, moved declarations, capture filtering,
 * capture/param reconciliation) into `captureInfo` and `ext`.
 *
 * Applies to both top-level and nested segments. Per-segment matching is keyed
 * by `migrationKey` (`preRenameSymbolName.get(ext.symbolName) ?? ext.symbolName`),
 * so a `move` decision targeting a nested segment lands its declaration in
 * that nested segment's file rather than its parent.
 *
 * Caller-side precondition: only invoked when `!ext.isInlinedQrl`.
 * `inlinedQrl` extractions skip migration wiring because their capture list
 * is pre-baked by the upstream tool.
 *
 * **Mutation surface (preserved verbatim from the pre-OSS-357 inline form):**
 * - `captureInfo.autoImports` — `push`'d once per applicable `reexport`
 *   migration decision.
 * - `captureInfo.movedDeclarations` — `push`'d once per applicable `move`
 *   migration decision.
 * - `captureInfo.captureNames` — overwritten at the end with the post-filter
 *   capture list.
 * - `ext.captureNames` — filtered in place to drop migrated var names.
 * - `ext.captures` — recomputed from the filtered captureNames; may flip to
 *   `false` when all remaining captures are also paramNames.
 *
 * Reads from `ctx.{program, originalImports, migrationDecisions,
 * moduleLevelDeclsByName, segmentUsage, parentModulePath,
 * preRenameSymbolName}` and `prep.{sameFileSymbols, defaultExportedNames,
 * renamedExports}`.
 */
export function wireMigration(
  ext: ConsolidatedSegment,
  captureInfo: SegmentCaptureInfo,
  ctx: SegmentGenerationContext,
  prep: SegmentGenerationPrep,
): void {
  const {
    program,
    originalImports,
    migrationDecisions,
    moduleLevelDeclsByName,
    segmentUsage,
    parentModulePath,
    preRenameSymbolName,
  } = ctx;
  const { sameFileSymbols, defaultExportedNames, renamedExports } = prep;

  const migrationKey =
    preRenameSymbolName.get(ext.symbolName) ?? ext.symbolName;

  const segUsage = segmentUsage.get(migrationKey);
  if (segUsage) {
    for (const decision of migrationDecisions) {
      if (
        decision.action === "reexport" &&
        segUsage.has(decision.varName)
      ) {
        const decl = moduleLevelDeclsByName.get(decision.varName);
        if (decl?.isExported) {
          continue;
        }
        captureInfo.autoImports.push({
          varName: decision.varName,
          parentModulePath,
        });
      }
    }
  }

  const movedDeclRanges = new Set<string>();
  for (const decision of migrationDecisions) {
    if (
      decision.action === "move" &&
      decision.targetSegment === migrationKey
    ) {
      const decl = moduleLevelDeclsByName.get(decision.varName);
      if (decl) {
        const rangeKey = `${decl.declStart}:${decl.declEnd}`;
        if (movedDeclRanges.has(rangeKey)) continue;
        movedDeclRanges.add(rangeKey);
        const importDeps: Array<{
          localName: string;
          importedName: string;
          source: string;
        }> = [];
        const declIdentifiers = new Set<string>();
        walk(program, {
          enter(node: AstNode) {
            if (
              node.type === "Identifier" &&
              node.start >= decl.declStart &&
              node.end <= decl.declEnd
            ) {
              declIdentifiers.add(node.name);
            }
          },
        });
        for (const idName of declIdentifiers) {
          const imp = originalImports.get(idName);
          if (imp) {
            importDeps.push({
              localName: imp.localName,
              importedName: imp.importedName,
              source: imp.source,
            });
            continue;
          }

          if (!sameFileSymbols.has(idName) || idName === decision.varName) {
            continue;
          }

          if (defaultExportedNames.has(idName)) {
            importDeps.push({
              localName: idName,
              importedName: 'default',
              source: parentModulePath,
            });
            continue;
          }

          const exportedAs = renamedExports.get(idName);
          importDeps.push({
            localName: idName,
            importedName: exportedAs ?? idName,
            source: parentModulePath,
          });
        }
        const markerXform = tryBuildMarkerDeclMove(
          decl,
          ctx.extractions,
          ctx.relPath,
          ctx.options,
          ctx.qrlOutputExt,
          ctx.sourceExtensions,
        );
        if (markerXform) {
          // Replace the source-level `const X = component$(...)` with the
          // parent-rewrite-equivalent pair: a qrl ref for the extracted body,
          // followed by the marker-Qrl wrap. The componentQrl/qrl imports are
          // auto-collected by the segment's import pass.
          captureInfo.movedDeclarations.push({
            text: markerXform.qrlDecl,
            importDeps,
          });
          captureInfo.movedDeclarations.push({
            text: markerXform.wrapDecl,
            importDeps: [],
          });
        } else {
          // OSS-430: prefer the post-JSX-rewrite snapshot when the parent
          // captured one; falls back to the raw source slice. Snapshot
          // carries the Qwik JSX form (`_jsxSorted` / `_jsxSplit`) into
          // the moved helper instead of letting raw JSX fall through to
          // oxc-transform's React `_jsx` default.
          const rewrittenText = ctx.movedDeclSnapshots.get(decision.varName);
          captureInfo.movedDeclarations.push({
            text: rewrittenText ?? decl.declText,
            importDeps,
          });
        }
      }
    }
  }

  // Filter out migrated vars from captures
  const migratedVarNames = new Set<string>();
  for (const decision of migrationDecisions) {
    if (decision.action === "reexport" || decision.action === "move") {
      migratedVarNames.add(decision.varName);
    }
  }
  ext.captureNames = ext.captureNames.filter(
    (name) => !migratedVarNames.has(name),
  );
  ext.captures = ext.captureNames.length > 0;

  // Reconcile captures with paramNames after migration filtering
  if (ext.captures && ext.paramNames.length > 0) {
    const paramSet = new Set(ext.paramNames);
    const allCapturesInParams = ext.captureNames.every((name) =>
      paramSet.has(name),
    );
    if (allCapturesInParams) {
      ext.captures = false;
    }
  }

  captureInfo.captureNames = ext.captureNames;
}

/**
 * Build the per-child {@link NestedCallSiteInfo} array. Branches per child
 * on whether the call site is a JSX attribute (`eventHandler` ctxKind with
 * a `$`-suffixed callee) — the JSX-attr branch carries event-prop-name
 * transform, passive-event detection (via the `_q_ep_`/`_q_wp_`/`_q_dp_`
 * displayName pattern), loop-cross-capture detection, and loop-local-param
 * computation.
 */
export function buildNestedCallSites(
  children: ConsolidatedSegment[],
  childQrlVarNames: Map<string, string>,
  elementQpParamsMap: Map<string, string[]>,
  extractionLoopMap: Map<string, LoopContext[]>,
): NestedCallSiteInfo[] {
  const nestedCallSites: NestedCallSiteInfo[] = [];
  for (const child of children) {
    const qrlVarName =
      childQrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
    // OSS-441: jSXProp ctxKind is a Component-side `$`-suffix attr that
    // OSS-438's harmonisation correctly classifies separately from
    // eventHandler. Both flow as JSX-attr call sites; the inner branch's
    // `isComponentEvent` arm already keeps the callee raw (`onEvent$`
    // stays `onEvent$`, no `q-e:event` transform).
    const isJsxAttr =
      (child.ctxKind === "eventHandler" || child.ctxKind === "jSXProp") &&
      child.calleeName.endsWith("$") &&
      child.calleeName !== "$";
    if (isJsxAttr) {
      let propName: string;
      if (child.isComponentEvent) {
        propName = child.calleeName;
      } else {
        const passiveSet = new Set<string>();
        const displayNamePath = child.displayName ?? child.symbolName;
        const callee = child.calleeName;
        let eventNameForPassive = callee;
        if (eventNameForPassive.startsWith("document:"))
          eventNameForPassive = eventNameForPassive.slice(9);
        else if (eventNameForPassive.startsWith("window:"))
          eventNameForPassive = eventNameForPassive.slice(7);
        if (
          eventNameForPassive.startsWith("on") &&
          eventNameForPassive.endsWith("$")
        ) {
          eventNameForPassive = eventNameForPassive
            .slice(2, -1)
            .toLowerCase();
        }
        if (
          displayNamePath.includes("_q_ep_") ||
          displayNamePath.includes("_q_wp_") ||
          displayNamePath.includes("_q_dp_")
        ) {
          passiveSet.add(eventNameForPassive);
        }
        propName =
          transformEventPropName(child.calleeName, passiveSet) ??
          child.calleeName;
      }

      // Two-armed detection: an event-handler QRL needs `.w([captures])`
      // wiring whenever it captures something the runtime can't deliver
      // positionally. The original arm catches the "handler has loop-iter
      // padded params (`_, _1, ...`)" case where some captures became
      // positional. The second arm catches the "handler is inside a loop
      // AND has cross-scope captures only" case (e.g. an `onClick$` deep
      // inside three nested maps that captures an outer-loop-derived
      // const) — that handler has no loop-iter padding because it doesn't
      // reference the immediate-loop iter vars, but it still needs the
      // `.w()` binding emitted in the outer scope where its captures are
      // in scope, otherwise the parent body references the captured var
      // nowhere and the side-effect simplifier strips the decl.
      const childIsInLoop =
        (extractionLoopMap.get(child.symbolName)?.length ?? 0) > 0;
      const hasLoopCrossCaptures =
        child.captures &&
        child.captureNames.length > 0 &&
        (
          (child.paramNames.length >= 2 &&
            child.paramNames[0] === "_" &&
            child.paramNames[1] === "_1") ||
          childIsInLoop
        );

      const loopLocalParams: string[] = [];
      if (
        child.paramNames.length >= 2 &&
        child.paramNames[0] === "_" &&
        child.paramNames[1] === "_1"
      ) {
        for (let pi = 2; pi < child.paramNames.length; pi++) {
          const p = child.paramNames[pi];
          if (numberedPaddingParam.test(p)) continue;
          loopLocalParams.push(p);
        }
      }

      nestedCallSites.push({
        qrlVarName,
        callStart: child.callStart,
        callEnd: child.callEnd,
        isJsxAttr: true,
        attrStart: child.callStart,
        attrEnd: child.callEnd,
        transformedPropName: propName,
        hoistedSymbolName: hasLoopCrossCaptures
          ? child.symbolName
          : undefined,
        hoistedCaptureNames: hasLoopCrossCaptures
          ? child.captureNames
          : undefined,
        // OSS-444: a JSX-attr child segment that captures variables but
        // isn't subject to the loop-cross hoist path still needs `.w(…)`
        // capture wrapping at the parent's prop call site. Mirrors the
        // inline-strategy path at `rewrite/inline-body.ts:242-244`. The
        // body-transforms consumer reads this only when
        // `hoistedSymbolName` is unset.
        captureNames:
          !hasLoopCrossCaptures && child.captureNames.length > 0
            ? child.captureNames
            : undefined,
        loopLocalParamNames:
          loopLocalParams.length > 0 ? loopLocalParams : undefined,
        elementQpParams: elementQpParamsMap.get(child.symbolName),
      });
    } else {
      nestedCallSites.push({
        qrlVarName,
        callStart: child.callStart,
        callEnd: child.callEnd,
        isJsxAttr: false,
        qrlCallee: child.isBare ? undefined : child.qrlCallee || undefined,
        captureNames:
          child.captureNames.length > 0 ? child.captureNames : undefined,
        importSource: child.importSource || undefined,
      });
    }
  }
  return nestedCallSites;
}

/**
 * Build a single default-strategy {@link TransformModule} for `ext`. Default
 * strategy emits each segment as a standalone module with its own code,
 * metadata, and import context (vs the inline strategy's metadata-only
 * shape — see {@link buildInlineStrategySegment}).
 *
 * Sequences seven sub-phases against the per-extraction state:
 * 1. Build per-child QRL declarations + childQrlVarNames map.
 * 2. Initialise captureInfo + consolidate destructured prop-field captures.
 * 3. Wire pre-computed const literal inlining.
 * 4. Wire top-level migration (only when `parent === null && !isInlinedQrl`).
 * 5. Build nested call-site info.
 * 6. Generate segment code (or stripped sentinel) + post-process.
 * 7. Build SegmentMetadataInternal + final TransformModule.
 *
 * Returns the module plus `keyCounterValue` (the JSX key counter advanced
 * by `generateSegmentCode`); the orchestrator threads that value into the
 * next iteration.
 */
export function buildDefaultStrategySegment(
  ext: ConsolidatedSegment,
  ctx: SegmentGenerationContext,
  prep: SegmentGenerationPrep,
  stripped: boolean,
  segmentKeyCounter: number,
): { module: TransformModule; keyCounterValue: number | undefined } {
  const {
    options, relPath,
    emitMode, devFile, entryStrategy, migrationDecisions,
    moduleLevelDeclsByName,
    parentModulePath, qrlOutputExt,
    sourceExtensions, parentSourceExt, shouldTranspileJsx, shouldTranspileTs, isJsx,
    importedNames, elementQpParamsMap,
    constLiteralsMap,
  } = ctx;
  const {
    extBySymbol, sortedExtractions, sameFileSymbols,
    defaultExportedNames, renamedExports, segmentImportList,
    enumValueMap, fieldMaps,
  } = prep;

  const children = sortedExtractions.filter(
    (c) => c.parent === ext.symbolName && !c.isSync,
  );
  const isDevMode = emitMode === "dev" || emitMode === "hmr";
  const { nestedQrlDecls, childQrlVarNames } = buildNestedQrlDeclarations(
    children, options, isDevMode, devFile, qrlOutputExt,
  );

  // Build capture info
  const captureInfo: SegmentCaptureInfo = {
    captureNames: ext.captureNames,
    autoImports: [],
    movedDeclarations: [],
  };

  // Consolidate destructured prop-field captures into _rawProps.
  // Default-strategy: writes to captureInfo + ext (vs the inline path which
  // only writes to ext). Shared helper produces the same partition for both.
  if (ext.parent !== null && ext.captureNames.length > 0) {
    const fieldMap = fieldMaps.get(ext.parent);
    if (fieldMap !== undefined && fieldMap.size > 0) {
      const fieldDefaults = prep.fieldDefaultsMaps.get(ext.parent);
      const result = consolidateRawPropsCaptures(ext.captureNames, fieldMap, fieldDefaults);
      if (result !== null) {
        captureInfo.captureNames = result.newCaptureNames;
        captureInfo.propsFieldCaptures = result.propsFieldCaptures;
        if (result.propsFieldDefaults !== undefined) {
          captureInfo.propsFieldDefaults = result.propsFieldDefaults;
        }
        ext.captureNames = result.newCaptureNames;
        ext.captures = result.newCaptureNames.length > 0;
      }
    }
  }

  // Wire pre-computed const literal inlining info
  const preComputedConsts = constLiteralsMap.get(ext.symbolName);
  if (preComputedConsts) {
    captureInfo.constLiterals = preComputedConsts;
    captureInfo.captureNames = ext.captureNames;
  }

  // Wire migration info for both top-level and nested segments. Per-segment
  // matching is keyed by migrationKey, so a move decision targeting a nested
  // segment lands its declaration in that nested segment's file (F4).
  if (!ext.isInlinedQrl) {
    wireMigration(ext, captureInfo, ctx, prep);
  }

  const nestedCallSites = buildNestedCallSites(
    children, childQrlVarNames, elementQpParamsMap, ctx.extractionLoopMap,
  );

  const effectiveCaptureInfo = resolveCaptureInfo(
    captureInfo,
    ext.isInlinedQrl,
  );

  // Build import context
  const importContext: SegmentImportData = {
    moduleImports: segmentImportList,
    sameFileSymbols,
    defaultExportedNames:
      defaultExportedNames.size > 0 ? defaultExportedNames : undefined,
    renamedExports: renamedExports.size > 0 ? renamedExports : undefined,
    parentModulePath,
    migrationDecisions: migrationDecisions.map((d) => {
      const decl = moduleLevelDeclsByName.get(d.varName);
      return {
        varName: d.varName,
        action: d.action,
        isExported: decl?.isExported ?? false,
      };
    }),
  };

  // Generate segment code.
  // OSS-431: when source carries a foreign `@jsxImportSource` pragma, skip
  // Qwik's JSX-syntax rewrite entirely. The JSX in the body stays as-is and
  // oxc-transform's default JSX transform (run by `postProcessSegmentCode`)
  // honors the pragma we'll prepend below.
  const segmentResult = stripped
    ? { code: generateStrippedSegmentCode(ext.symbolName) }
    : generateSegmentCode(
        ext,
        nestedQrlDecls.length > 0 ? nestedQrlDecls : undefined,
        effectiveCaptureInfo,
        (() => {
          const srcExt =
            sourceExtensions.get(ext.symbolName) ?? ext.extension;
          return (
            !ctx.hasForeignJsxRuntime &&
            shouldTranspileJsx &&
            (srcExt === ".tsx" || srcExt === ".jsx" || isJsx)
          );
        })()
          ? {
              enableJsx: true,
              importedNames,
              paramNames: ext.paramNames.length > 0
                ? new Set(ext.paramNames)
                : undefined,
              relPath,
              // OSS-428: JSX dev-info `fileName:` only switches to the
              // user-supplied dev path when explicitly set on the input.
              // The composed `devFile` (srcDir+relPath fallback) keeps
              // `relPath` semantics here — preserves baseline-passing
              // `example_dev_mode_inlined` / `example_jsx_keyed_dev` etc.
              devOptions: isDevMode ? { relPath: ctx.userDevPath ?? relPath } : undefined,
              // OSS-410: source-relative dev-info positions. `transformSegmentJsx`
              // wraps the body as `(${bodyText})` before parsing; the wrapper
              // length is 1 (single `(`), and `ext.loc[0]` is the body's byte
              // offset in the original source. Only populated when dev-info
              // is requested.
              source: isDevMode ? ctx.repairedCode : undefined,
              bodyOriginOffset: isDevMode ? ext.loc[0] : undefined,
              keyCounterStart: segmentKeyCounter,
            }
          : undefined,
        nestedCallSites.length > 0 ? nestedCallSites : undefined,
        importContext,
        enumValueMap.size > 0 ? enumValueMap : undefined,
      );
  let segmentCode = segmentResult.code;

  // OSS-431: prepend foreign `@jsxImportSource` pragma so oxc-transform's
  // TS-strip + JSX-transform pass inside `postProcessSegmentCode` honors it
  // and emits `import { jsx as _jsx } from "<pkg>/jsx-runtime"`. The segment
  // file is a brand-new generated module and wouldn't otherwise inherit the
  // pragma from the user source.
  if (!stripped && ctx.hasForeignJsxRuntime && ctx.foreignJsxPragmaText) {
    segmentCode = ctx.foreignJsxPragmaText + '\n' + segmentCode;
  }

  if (!stripped) {
    segmentCode = postProcessSegmentCode(segmentCode, {
      symbolName: ext.symbolName,
      canonicalFilename: ext.canonicalFilename,
      extension: ext.extension,
      ctxName: ext.ctxName,
      sourceExtensions,
      parentSourceExt,
      shouldTranspileTs,
      shouldTranspileJsx,
      isServer: options.isServer,
      emitMode,
      devFile,
    });
  }

  // Build segment metadata and entry field
  let parentComponentSymbol: string | null = null;
  if (entryStrategy.type === "component") {
    let current = ext.parent;
    while (current) {
      const parentExt = extBySymbol.get(current!);
      if (parentExt && parentExt.ctxName === "component") {
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
    hasManualEntryMap(entryStrategy) ? entryStrategy.manual : undefined,
  );

  const segmentAnalysis: SegmentMetadataInternal = {
    origin: ext.origin,
    name: ext.symbolName,
    entry: entryField,
    displayName: ext.displayName,
    hash: ext.hash,
    canonicalFilename: ext.canonicalFilename,
    extension: ext.extension.replace(leadingDot, ""),
    parent: ext.parent,
    ctxKind: ext.ctxKind,
    ctxName: ext.ctxName,
    captures: ext.captures,
    loc: ext.loc,
    captureNames: ext.captureNames,
    paramNames: ext.paramNames,
  };

  return {
    module: {
      kind: 'segment',
      path: mkRelativePath(ext.canonicalFilename + ext.extension),
      isEntry: true,
      code: segmentCode,
      map: null,
      segment: segmentAnalysis,
    },
    keyCounterValue: segmentResult.keyCounterValue,
  };
}

/**
 * Generate all segment TransformModule entries.
 *
 * This is Phase 5 of the transform pipeline -- producing segment modules
 * with their code, metadata, and import context. The function is a thin
 * sequencer over {@link computeSegmentGenerationPrep} (per-call setup) +
 * a per-extraction loop that forks on entry strategy:
 * inline/hoist → {@link buildInlineStrategySegment} (metadata-only emit);
 * default → {@link buildDefaultStrategySegment} (full code + metadata).
 *
 * The JSX key counter is threaded across segments so per-module JSX keys
 * stay unique.
 */
export function generateAllSegmentModules(
  ctx: SegmentGenerationContext,
): TransformModule[] {
  const prep = computeSegmentGenerationPrep(ctx);
  const allModules: TransformModule[] = [];

  // OSS-432 Bug C: pre-compute the per-segment JSX-key starting counter in
  // SOURCE order, independent of the depth-first processing order used by
  // the main loop below. SWC's reference consumes JSX keys per source
  // position; consuming in depth-first segment order produces stable but
  // SWC-divergent keys (e.g. `example_qwik_conflict` Foo body at line 13
  // would get `u6_1` because Root_1's `<div/>` at line 27 gets `u6_0`
  // when processed first as a depth-1 child). Surfaced when Bug A + Bug B
  // exposed the segment-side comparison previously masked by the parent
  // mismatch.
  const segmentStartKey = computeSegmentStartKeys(
    prep.sortedExtractions,
    ctx.parentJsxKeyCounterValue,
  );

  for (const ext of prep.sortedExtractions) {
    if (ext.isSync) continue;

    const stripped = isStrippedSegment(
      ext.ctxName,
      ext.ctxKind,
      ctx.options.stripCtxName,
      ctx.options.stripEventHandlers,
    );
    // OSS-389: stripped-segment fallback zeros loc before SegmentAnalysis
    // emission. Internal-builder cast — see extract.ts `Mutable<T>`.
    if (stripped) (ext as Mutable<ConsolidatedSegment>).loc = [mkByteOffset(0), mkByteOffset(0)];

    // OSS-426 Sub-B: clear capture metadata for event-handler segments
    // stripped via `stripEventHandlers`. SWC's reference emits these with
    // `captures: false, captureNames: []` because the body is gone — the
    // runtime never consumes the captures, so the metadata reflects that.
    // `stripCtxName`-stripped segments preserve their captures (different
    // policy: those carry runtime-meaningful info even with `null` body).
    if (
      stripped &&
      ctx.options.stripEventHandlers &&
      ext.ctxKind === 'eventHandler'
    ) {
      const mut = ext as Mutable<ConsolidatedSegment>;
      mut.captures = false;
      mut.captureNames = [];
    }

    if (ctx.isInlineStrategy) {
      const inlineModule = buildInlineStrategySegment(ext, ctx, prep, stripped);
      // OSS-425: null result means non-stripped inline — body inlined into
      // parent, no segment file emitted (matches SWC's reference behavior).
      if (inlineModule !== null) allModules.push(inlineModule);
      continue;
    }

    const startKey = segmentStartKey.get(ext.symbolName) ?? ctx.parentJsxKeyCounterValue;
    const result = buildDefaultStrategySegment(
      ext, ctx, prep, stripped, startKey,
    );
    allModules.push(result.module);
  }

  return allModules;
}

/**
 * Pre-compute the JSX-key counter value each segment should START at.
 *
 * SWC's ordering rule: top-level extractions are processed in SOURCE
 * order (by their body's byte offset); within each subtree the traversal
 * is depth-first leaves-first (children consume keys before their
 * parent). The current `sortedExtractions` does global depth-first
 * descending, which mixes subtrees across top-level extractions — fine
 * for codegen ordering but produces JSX keys that don't match SWC when
 * two top-level subtrees both contain JSX.
 *
 * Each segment's exclusive JSX consumption is its own body's JSX-element
 * count minus the sum of its direct children's totals — because a
 * parent's bodyText textually contains its children's bodyText, naive
 * totals would double-count.
 */
function computeSegmentStartKeys(
  sortedExtractions: readonly ConsolidatedSegment[],
  parentJsxKeyCounterValue: number,
): Map<string, number> {
  // 1. Total JSX-element count per extraction (raw body walk).
  const totalCount = new Map<string, number>();
  for (const ext of sortedExtractions) {
    totalCount.set(ext.symbolName, countJsxKeyConsumption(ext.bodyText));
  }

  // 2. Index children by parent for the recursive traversal below.
  const childrenBySymbol = new Map<string, ConsolidatedSegment[]>();
  for (const ext of sortedExtractions) {
    if (ext.parent === null) continue;
    const arr = childrenBySymbol.get(ext.parent);
    if (arr) arr.push(ext);
    else childrenBySymbol.set(ext.parent, [ext]);
  }

  // 3. Exclusive JSX consumption per segment.
  const exclusiveCount = new Map<string, number>();
  for (const ext of sortedExtractions) {
    let own = totalCount.get(ext.symbolName) ?? 0;
    const directChildren = childrenBySymbol.get(ext.symbolName) ?? [];
    for (const child of directChildren) {
      own -= totalCount.get(child.symbolName) ?? 0;
    }
    exclusiveCount.set(ext.symbolName, Math.max(0, own));
  }

  // 4. Walk top-level extractions in source order; within each, recurse
  // depth-first (children-in-source-order first, then self).
  const result = new Map<string, number>();
  let counter = parentJsxKeyCounterValue;

  function visit(ext: ConsolidatedSegment): void {
    if (ext.isSync) return;
    const children = childrenBySymbol.get(ext.symbolName) ?? [];
    const childrenInSourceOrder = [...children].sort((a, b) => a.argStart - b.argStart);
    for (const child of childrenInSourceOrder) visit(child);
    result.set(ext.symbolName, counter);
    counter += exclusiveCount.get(ext.symbolName) ?? 0;
  }

  const topLevelInSourceOrder = sortedExtractions
    .filter((ext) => ext.parent === null)
    .slice()
    .sort((a, b) => a.argStart - b.argStart);
  for (const ext of topLevelInSourceOrder) visit(ext);

  return result;
}

/**
 * Count how many JSX elements / fragments a body text consumes from
 * `JsxKeyCounter.next()` during the JSX transform. Used by
 * {@link computeSegmentStartKeys} to know how much each segment will
 * advance the global counter.
 *
 * Mirrors `transformJsxElement`'s key-emission rule in
 * `jsx-elements-core.ts:480-487`: a JSXElement that is a JSX-child of a
 * JSXElement or JSXFragment AND has an HTML tag (lowercase first
 * character) gets a `null` key and does NOT advance the counter. All
 * other JSXElements + every JSXFragment do advance the counter. Without
 * this rule, segments whose body is `<><div/></>` shape over-count by
 * one (the inner HTML element gets `null`, not a real key).
 */
function countJsxKeyConsumption(bodyText: string): number {
  // Cheap regex prefilter — if the body contains nothing JSX-shaped, skip
  // the parse. Both `<tag` (element) and `<>` (fragment) start with `<`.
  if (bodyText.indexOf('<') === -1) return 0;
  try {
    const parsed = parseWithRawTransfer('segment-jsx-count.tsx', `(${bodyText})`);
    let count = 0;
    function isHtmlElementName(n: AstNode | null | undefined): boolean {
      if (!n || n.type !== 'JSXElement') return false;
      const name = n.openingElement?.name;
      if (!name || name.type !== 'JSXIdentifier') return false;
      const first = name.name[0];
      return !!first && first === first.toLowerCase() && first >= 'a' && first <= 'z';
    }
    function walk(
      n: AstNode | null | undefined,
      parentIsJsxParent: boolean,
    ): void {
      if (!n) return;
      if (n.type === 'JSXElement') {
        // Skip: HTML element that's a JSX child of another JSXElement /
        // JSXFragment — receives a null key and doesn't advance counter.
        if (!(parentIsJsxParent && isHtmlElementName(n))) count++;
      } else if (n.type === 'JSXFragment') {
        count++;
      }
      const childIsInJsxParent = n.type === 'JSXElement' || n.type === 'JSXFragment';
      forEachAstChild(n, (child) => walk(child, childIsInJsxParent));
    }
    walk(parsed.program, false);
    return count;
  } catch {
    return 0;
  }
}
