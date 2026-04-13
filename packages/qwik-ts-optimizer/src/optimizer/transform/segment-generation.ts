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
  type SegmentImportContext,
} from "../segment-codegen.js";
import { resolveEntryField } from "../entry-strategy.js";
import { buildQrlDeclaration } from "../rewrite-calls.js";
import { buildQrlDevDeclaration } from "../dev-mode.js";
import { isStrippedSegment, generateStrippedSegmentCode } from "../strip-ctx.js";
import {
  buildStrippedNoopQrl,
  buildStrippedNoopQrlDev,
  getSentinelCounter,
} from "../inline-strategy.js";
import { transformEventPropName } from "./event-handlers.js";
import {
  extractDestructuredFieldMap,
  resolveConstLiterals,
} from "../rewrite/index.js";
import { collectSameFileSymbolInfo } from "../utils/module-symbols.js";
import { rewriteImportSource } from "../rewrite-imports.js";
import {
  getManualEntryMap,
  leadingDot,
  numberedPaddingParam,
  paddingParam,
  getEffectiveCaptureInfo,
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

/** Build moduleImports array for SegmentImportContext. */
export function buildModuleImportsForContext(
  originalImports: Map<string, ImportInfo>,
  importAttributesMap: Map<string, Record<string, string>>,
): SegmentImportContext["moduleImports"] {
  const moduleImportsForContext: SegmentImportContext["moduleImports"] = [];
  const addedModuleImports = new Set<string>();
  for (const [, imp] of originalImports) {
    moduleImportsForContext.push({
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
      moduleImportsForContext.push({
        localName: name,
        importedName: name,
        source: "@qwik.dev/core",
      });
    }
  }

  return moduleImportsForContext;
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
 * Generate all segment TransformModule entries.
 *
 * This is Phase 5 of the transform pipeline -- producing segment modules
 * with their code, metadata, and import context.
 */
export function generateAllSegmentModules(
  ctx: SegmentGenerationContext,
): TransformModule[] {
  const allModules: TransformModule[] = [];
  const {
    updatedExtractions, program, originalImports, options, relPath,
    emitMode, devFile, isInlineStrategy, entryStrategy, migrationDecisions,
    moduleLevelDecls, moduleLevelDeclsByName, segmentUsage,
    parentModulePath, preRenameSymbolName, qrlOutputExt,
    sourceExtensions, shouldTranspileJsx, shouldTranspileTs, isJsx,
    importedNames, enclosingExtMap, elementQpParamsMap,
    constLiteralsMap,
  } = ctx;

  // Build O(1) lookup map for extractions by symbolName
  const extBySymbol = new Map<string, ExtractionResult>();
  for (const ext of updatedExtractions) {
    extBySymbol.set(ext.symbolName, ext);
  }

  // Sort extractions so children are processed before parents (depth-first, leaves first).
  const extractionDepth = new Map<string, number>();
  for (const ext of updatedExtractions) {
    let depth = 0;
    let current = ext.parent;
    while (current) {
      depth++;
      const parentExt = extBySymbol.get(current);
      current = parentExt?.parent ?? null;
    }
    extractionDepth.set(ext.symbolName, depth);
  }
  updatedExtractions.sort((a, b) => {
    const da = extractionDepth.get(a.symbolName) ?? 0;
    const db = extractionDepth.get(b.symbolName) ?? 0;
    return db - da;
  });

  // Track running JSX key counter across segments
  let segmentKeyCounter = ctx.parentJsxKeyCounterValue;

  // Collect same-file exported/declared names for self-referential segment imports
  const { sameFileExports, defaultExportedNames, renamedExports } =
    collectSameFileSymbolInfo(program);

  // Collect import attributes and build module imports context
  const importAttributesMap = collectImportAttributes(program);
  const moduleImportsForContext = buildModuleImportsForContext(
    originalImports, importAttributesMap,
  );

  // Collect TS enum declarations for value inlining
  const enumValueMap = collectEnumValueMap(program, shouldTranspileTs);

  // Caches for per-parent-body operations
  const fieldMapCache = new Map<string, Map<string, string>>();
  function cachedFieldMap(parentExt: {
    symbolName: string;
    bodyText: string;
  }): Map<string, string> {
    let cached = fieldMapCache.get(parentExt.symbolName);
    if (cached === undefined) {
      cached = extractDestructuredFieldMap(parentExt.bodyText);
      fieldMapCache.set(parentExt.symbolName, cached);
    }
    return cached;
  }

  for (const ext of updatedExtractions) {
    if (ext.isSync) continue;

    // Check if this segment is stripped
    const stripped = isStrippedSegment(
      ext.ctxName,
      ext.ctxKind,
      options.stripCtxName,
      options.stripEventHandlers,
    );

    if (stripped) {
      ext.loc = [0, 0];
    }

    // For inline strategy: apply _rawProps consolidation for metadata
    if (
      isInlineStrategy &&
      ext.parent !== null &&
      ext.captureNames.length > 0
    ) {
      const parentExt = extBySymbol.get(ext.parent!);
      if (parentExt) {
        const fieldMap = cachedFieldMap(parentExt);
        if (fieldMap.size > 0) {
          const nonPropsCaptures: string[] = [];
          let hasPropsFields = false;
          for (const name of ext.captureNames) {
            if (fieldMap.has(name)) {
              hasPropsFields = true;
            } else {
              nonPropsCaptures.push(name);
            }
          }
          if (hasPropsFields) {
            const propsFieldCaptures = new Map<string, string>();
            for (const name of ext.captureNames) {
              if (fieldMap.has(name)) {
                propsFieldCaptures.set(name, fieldMap.get(name)!);
              }
            }
            ext.propsFieldCaptures = propsFieldCaptures;
            ext.captureNames = [...nonPropsCaptures, "_rawProps"].sort();
            ext.captures = ext.captureNames.length > 0;
          }
        }
      }
    }

    // For inline/hoist strategy, emit metadata only
    if (isInlineStrategy) {
      const entryField = resolveEntryField(
        entryStrategy.type,
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

      const segmentModule: TransformModule = {
        path: ext.canonicalFilename + ext.extension,
        isEntry: true,
        code: stripped ? generateStrippedSegmentCode(ext.symbolName) : "",
        map: null,
        segment: segmentAnalysis,
        origPath: null,
      };
      allModules.push(segmentModule);
      continue;
    }

    // Default strategy: emit separate segment modules
    const children = updatedExtractions.filter(
      (c) => c.parent === ext.symbolName && !c.isSync,
    );
    const isDevMode = emitMode === "dev" || emitMode === "hmr";
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

    // Build capture info
    const captureInfo: SegmentCaptureInfo = {
      captureNames: ext.captureNames,
      autoImports: [],
      movedDeclarations: [],
    };

    // Consolidate destructured prop-field captures into _rawProps
    if (ext.parent !== null && ext.captureNames.length > 0) {
      const parentExt = extBySymbol.get(ext.parent!);
      if (parentExt) {
        const fieldMap = cachedFieldMap(parentExt);
        if (fieldMap.size > 0) {
          const propsFieldCaptures = new Map<string, string>();
          const nonPropsCaptures: string[] = [];
          for (const name of ext.captureNames) {
            if (fieldMap.has(name)) {
              propsFieldCaptures.set(name, fieldMap.get(name)!);
            } else {
              nonPropsCaptures.push(name);
            }
          }
          if (propsFieldCaptures.size > 0) {
            const newCaptureNames = [...nonPropsCaptures, "_rawProps"].sort();
            captureInfo.captureNames = newCaptureNames;
            captureInfo.propsFieldCaptures = propsFieldCaptures;
            ext.captureNames = newCaptureNames;
            ext.captures = newCaptureNames.length > 0;
          }
        }
      }
    }

    // Wire pre-computed const literal inlining info
    const preComputedConsts = constLiteralsMap.get(ext.symbolName);
    if (preComputedConsts) {
      captureInfo.constLiterals = preComputedConsts;
      captureInfo.captureNames = ext.captureNames;
    }

    // For top-level segments (no parent): wire migration info
    if (ext.parent === null && !ext.isInlinedQrl) {
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

      for (const decision of migrationDecisions) {
        if (
          decision.action === "move" &&
          decision.targetSegment === migrationKey
        ) {
          const decl = moduleLevelDeclsByName.get(decision.varName);
          if (decl) {
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
              }
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

    // Build nested call site info
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

    const effectiveCaptureInfo = getEffectiveCaptureInfo(
      captureInfo,
      ext.isInlinedQrl,
    );

    // Build import context
    const importContext: SegmentImportContext = {
      moduleImports: moduleImportsForContext,
      sameFileExports,
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

    if (segmentResult.keyCounterValue !== undefined) {
      segmentKeyCounter = segmentResult.keyCounterValue;
    }

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

  return allModules;
}
