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
import type { ExtractionResult } from "../extract.js";
import type { ImportInfo } from "../marker-detection.js";
import type { MigrationDecision, ModuleLevelDecl } from "../variable-migration.js";
import type {
  TransformModule,
  SegmentMetadataInternal,
  TransformModulesOptions,
  EntryStrategy,
} from "../types.js";
import {
  generateSegmentCode,
  type SegmentCaptureInfo,
  type NestedCallSiteInfo,
  type SegmentImportData,
} from "../segment-codegen.js";
import { resolveEntryField } from "../entry-strategy.js";
import { buildQrlDeclaration } from "../rewrite-calls.js";
import { buildQrlDevDeclaration } from "../dev-mode.js";
import { generateStrippedSegmentCode } from "../strip-ctx.js";
import { isStrippedSegment } from "../rewrite/predicates.js";
import {
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  getSentinelCounter,
} from "../inline-strategy.js";
import { transformEventPropName } from "./event-handlers.js";
import {
  extractDestructuredFieldMap,
} from "../rewrite/index.js";
import { collectSameFileSymbolInfo } from "../utils/module-symbols.js";
import { rewriteImportSource } from "../rewrite-imports.js";
import {
  getManualEntryMap,
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
  extractions: ExtractionResult[];
  updatedExtractions: ExtractionResult[];
  program: AstProgram;
  originalImports: Map<string, ImportInfo>;
  options: TransformModulesOptions;
  repairedCode: string;
  relPath: string;
  emitMode: string;
  devFile: string | undefined;
  isInlineStrategy: boolean;
  entryStrategy: EntryStrategy;
  migrationDecisions: MigrationDecision[];
  moduleLevelDecls: ModuleLevelDecl[];
  moduleLevelDeclsByName: Map<string, ModuleLevelDecl>;
  segmentUsage: Map<string, Set<string>>;
  parentModulePath: string;
  preRenameSymbolName: Map<string, string>;
  qrlOutputExt: string | undefined;
  sourceExtensions: Map<string, string>;
  shouldTranspileJsx: boolean;
  shouldTranspileTs: boolean;
  isJsx: boolean;
  importedNames: Set<string>;
  enclosingExtMap: Map<string, ExtractionResult>;
  elementQpParamsMap: Map<string, string[]>;
  extractionLoopMap: Map<string, LoopContext[]>;
  constLiteralsMap: Map<string, Map<string, string>>;
  parentJsxKeyCounterValue: number;
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
  extBySymbol: Map<string, ExtractionResult>;
  sortedExtractions: ExtractionResult[];
  sameFileSymbols: Set<string>;
  defaultExportedNames: Set<string>;
  renamedExports: Map<string, string>;
  segmentImportList: SegmentImportData["moduleImports"];
  enumValueMap: Map<string, Map<string, string>>;
  fieldMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
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
): RawPropsConsolidation | null {
  const propsFieldCaptures = new Map<string, string>();
  const nonPropsCaptures: string[] = [];
  for (const name of captureNames) {
    const fieldExpr = fieldMap.get(name);
    if (fieldExpr !== undefined) {
      propsFieldCaptures.set(name, fieldExpr);
    } else {
      nonPropsCaptures.push(name);
    }
  }
  if (propsFieldCaptures.size === 0) return null;
  return {
    propsFieldCaptures,
    newCaptureNames: [...nonPropsCaptures, "_rawProps"].sort(),
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
  const extBySymbol = new Map<string, ExtractionResult>();
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

  return {
    extBySymbol,
    sortedExtractions: ctx.updatedExtractions,
    sameFileSymbols,
    defaultExportedNames,
    renamedExports,
    segmentImportList,
    enumValueMap,
    fieldMaps,
  };
}

/**
 * Build a single inline-strategy {@link TransformModule} — metadata-only,
 * with empty (or stripped) code. Inline/hoist entry strategies emit segment
 * bodies inside the parent module rather than as separate files, so Phase 5
 * here only contributes the per-segment metadata block.
 *
 * Mutates `ext.captureNames`, `ext.captures`, and `ext.propsFieldCaptures`
 * when raw-props consolidation applies — preserved verbatim from the
 * pre-OSS-356 inline form.
 */
export function buildInlineStrategySegment(
  ext: ExtractionResult,
  ctx: SegmentGenerationContext,
  prep: SegmentGenerationPrep,
  stripped: boolean,
): TransformModule {
  // Inline strategy: apply _rawProps consolidation for metadata
  if (ext.parent !== null && ext.captureNames.length > 0) {
    const fieldMap = prep.fieldMaps.get(ext.parent);
    if (fieldMap !== undefined && fieldMap.size > 0) {
      const result = consolidateRawPropsCaptures(ext.captureNames, fieldMap);
      if (result !== null) {
        ext.propsFieldCaptures = result.propsFieldCaptures;
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
    path: ext.canonicalFilename + ext.extension,
    isEntry: true,
    code: stripped ? generateStrippedSegmentCode(ext.symbolName) : "",
    map: null,
    segment: segmentAnalysis,
    origPath: null,
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
  children: ExtractionResult[],
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
  ext: ExtractionResult,
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
        captureInfo.movedDeclarations.push({
          text: decl.declText,
          importDeps,
        });
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
  children: ExtractionResult[],
  childQrlVarNames: Map<string, string>,
  elementQpParamsMap: Map<string, string[]>,
): NestedCallSiteInfo[] {
  const nestedCallSites: NestedCallSiteInfo[] = [];
  for (const child of children) {
    const qrlVarName =
      childQrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
    const isJsxAttr =
      child.ctxKind === "eventHandler" &&
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

      const hasLoopCrossCaptures =
        child.captures &&
        child.captureNames.length > 0 &&
        child.paramNames.length >= 2 &&
        child.paramNames[0] === "_" &&
        child.paramNames[1] === "_1";

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
  ext: ExtractionResult,
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
    sourceExtensions, shouldTranspileJsx, shouldTranspileTs, isJsx,
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
      const result = consolidateRawPropsCaptures(ext.captureNames, fieldMap);
      if (result !== null) {
        captureInfo.captureNames = result.newCaptureNames;
        captureInfo.propsFieldCaptures = result.propsFieldCaptures;
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
    children, childQrlVarNames, elementQpParamsMap,
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

  // Generate segment code
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
            shouldTranspileJsx &&
            (srcExt === ".tsx" || srcExt === ".jsx" || isJsx)
          );
        })()
          ? {
              enableJsx: true,
              importedNames,
              relPath,
              devOptions: isDevMode ? { relPath } : undefined,
              keyCounterStart: segmentKeyCounter,
            }
          : undefined,
        nestedCallSites.length > 0 ? nestedCallSites : undefined,
        importContext,
        enumValueMap.size > 0 ? enumValueMap : undefined,
      );
  let segmentCode = segmentResult.code;

  if (!stripped) {
    segmentCode = postProcessSegmentCode(segmentCode, {
      symbolName: ext.symbolName,
      canonicalFilename: ext.canonicalFilename,
      extension: ext.extension,
      ctxName: ext.ctxName,
      sourceExtensions,
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
    getManualEntryMap(entryStrategy as Exclude<EntryStrategy, { type: 'inline' } | { type: 'hoist' }>),
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
      path: ext.canonicalFilename + ext.extension,
      isEntry: true,
      code: segmentCode,
      map: null,
      segment: segmentAnalysis,
      origPath: null,
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
  let segmentKeyCounter = ctx.parentJsxKeyCounterValue;

  for (const ext of prep.sortedExtractions) {
    if (ext.isSync) continue;

    const stripped = isStrippedSegment(
      ext.ctxName,
      ext.ctxKind,
      ctx.options.stripCtxName,
      ctx.options.stripEventHandlers,
    );
    if (stripped) ext.loc = [0, 0];

    if (ctx.isInlineStrategy) {
      allModules.push(buildInlineStrategySegment(ext, ctx, prep, stripped));
      continue;
    }

    const result = buildDefaultStrategySegment(
      ext, ctx, prep, stripped, segmentKeyCounter,
    );
    if (result.keyCounterValue !== undefined) {
      segmentKeyCounter = result.keyCounterValue;
    }
    allModules.push(result.module);
  }

  return allModules;
}
