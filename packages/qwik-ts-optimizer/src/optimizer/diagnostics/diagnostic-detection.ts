import { walk } from 'oxc-walker';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstNode,
  AstParentNode,
  AstProgram,
} from '../../ast-types.js';
import type { ExtractionResult } from '../extraction/extract.js';
import {
  classifyDeclarationTypeInClosure,
  emitC02,
  emitC05,
  emitPassiveConflictWarning,
} from './diagnostics.js';
import { collectExportNames } from '../extraction/marker-detection.js';
import type { Diagnostic, DiagnosticHighlightFlat } from '../types/types.js';
import type { PassiveConflict } from '../analysis/module-gather-walk.js';
import { getJsxAttributeName } from '../jsx/jsx-attr-name.js';
import { plainQrlName } from '../qwik/qrl-naming.js';
import { computeLineColFromOffset } from './source-loc.js';
import {
  mkByteOffset,
  mkColumnNumber,
  mkLineNumber,
} from '../types/brands.js';

type SourceRange = { start: number; end: number };

/**
 * Construct a `DiagnosticHighlightFlat` from a byte range, computing the
 * line/col pairs and wrapping every position field with its brand.
 * Centralises the brand-construction so each diagnostic emitter doesn't
 * repeat the 6 wraps inline.
 */
function buildHighlight(source: string, lo: number, hi: number): DiagnosticHighlightFlat {
  const [startLine, startCol] = computeLineColFromOffset(source, lo);
  const [endLine, endCol] = computeLineColFromOffset(source, hi);
  return {
    lo: mkByteOffset(lo),
    hi: mkByteOffset(hi),
    startLine: mkLineNumber(startLine),
    startCol: mkColumnNumber(startCol),
    endLine: mkLineNumber(endLine),
    endCol: mkColumnNumber(endCol),
  };
}

export function detectC02Diagnostics(
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  closureFreeIdentifiers: ReadonlyMap<AstFunction, readonly string[]>,
  enclosingExtMap: Map<string, ExtractionResult>,
  importedNames: Set<string>,
  program: AstProgram,
  source: string,
  file: string,
  diagnostics: Diagnostic[],
): void {
  for (const extraction of extractions) {
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;

    const undeclaredIds = closureFreeIdentifiers.get(closureNode);
    if (!undeclaredIds || undeclaredIds.length === 0) continue;

    const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;
    const enclosingClosure = enclosingExt
      ? closureNodes.get(enclosingExt.symbolName)
      : undefined;

    // C02 fires only for fn/class refs declared inside an enclosing
    // extraction's closure — those decls live in a parent segment file
    // the current segment can't reach. Module-level fn/class refs are
    // handled by variable-migration (MIG-01 MOVE for single-segment use,
    // MIG-02/03/04 REEXPORT for multi-use), so the segment either inlines
    // the decl or imports it as `_auto_*`. Flagging those as C02 produces
    // false positives on legitimate code — e.g. `@qwik.dev/router`'s
    // module-level helpers consumed by useTask$ closures.
    if (!enclosingClosure) continue;

    // First pass: classify each undeclared id and collect the set of fn/class
    // names that need a reference-site lookup. We use the set both as the
    // walker's filter and to gate the second pass.
    type Classified = { refName: string; declType: 'var' | 'fn' | 'class' };
    const classified: Classified[] = [];
    const fnOrClassNames = new Set<string>();
    for (const refName of undeclaredIds) {
      if (importedNames.has(refName)) continue;
      let declType: 'var' | 'fn' | 'class';
      try {
        declType = classifyDeclarationTypeInClosure(enclosingClosure, refName);
      } catch {
        declType = 'var';
      }
      if (declType === 'fn' || declType === 'class') {
        classified.push({ refName, declType });
        fnOrClassNames.add(refName);
      }
    }

    if (classified.length === 0) continue;

    // Single walk of the closure subtree collecting the first reference
    // site for every name in `fnOrClassNames`. A per-refName subtree
    // walk would be O(target_count × subtreeSize).
    const referenceSites = collectIdentifierReferenceSites(closureNode, fnOrClassNames);

    for (const { refName, declType } of classified) {
      const site = referenceSites.get(refName);
      if (!site) {
        diagnostics.push(emitC02(refName, file, declType === 'class'));
        continue;
      }
      diagnostics.push(
        emitC02(refName, file, declType === 'class', buildHighlight(source, site.start, site.end)),
      );
    }
  }
}

export function detectC05Diagnostics(
  program: AstProgram,
  moduleInfo: AstEcmaScriptModule | undefined,
  originalImports: Map<
    string,
    {
      localName: string;
      importedName: string;
      source: string;
      isQwikCore?: boolean;
    }
  >,
  source: string,
  file: string,
  diagnostics: Diagnostic[],
): void {
  const moduleExportNames = collectExportNames(program, moduleInfo);

  // Collect the set of `$`-suffixed export names that survive the gates;
  // we walk the program once for all of them rather than once per export.
  // A per-name walk would be O(target_count × programSize).
  const targets = new Set<string>();
  const targetToQrl = new Map<string, string>();
  for (const exportName of moduleExportNames) {
    if (!exportName.endsWith('$')) continue;
    const importInfo = originalImports.get(exportName);
    if (importInfo?.isQwikCore) continue;
    const qrlName = plainQrlName(exportName);
    if (moduleExportNames.has(qrlName)) continue;
    targets.add(exportName);
    targetToQrl.set(exportName, qrlName);
  }

  if (targets.size === 0) return;

  const callSitesByName = collectCallSitesByName(program, targets);

  for (const [exportName, sites] of callSitesByName) {
    const qrlName = targetToQrl.get(exportName);
    if (!qrlName) continue;
    for (const site of sites) {
      diagnostics.push(
        emitC05(exportName, qrlName, file, buildHighlight(source, site.start, site.end)),
      );
    }
  }
}

/**
 * Emit the warning diagnostics for passive:/preventdefault: conflicts
 * gathered by the canonical gather walk (`analysis/module-gather-walk.ts`).
 * Called at the Phase-4 site where `detectPassivePreventdefaultConflicts`
 * used to run, so diagnostic order is unchanged.
 */
export function emitPassiveConflictDiagnostics(
  conflicts: ReadonlyArray<PassiveConflict>,
  file: string,
  source: string,
  diagnostics: Diagnostic[],
): void {
  for (const conflict of conflicts) {
    diagnostics.push(
      emitPassiveConflictWarning(
        conflict.eventName,
        file,
        buildHighlight(source, conflict.start, conflict.end),
      ),
    );
  }
}

/**
 * Production routes through the canonical gather walk's passive-conflict
 * projection plus `emitPassiveConflictDiagnostics`; this standalone form is
 * retained as the differential oracle for that projection.
 */
export function detectPassivePreventdefaultConflicts(
  program: AstProgram,
  file: string,
  source: string,
  diagnostics: Diagnostic[],
): void {
  walk(program, {
    enter(node: AstNode) {
      if (node.type !== 'JSXOpeningElement') return;

      const attrs = node.attributes ?? [];
      const passiveEvents = new Set<string>();
      const preventdefaultEvents = new Set<string>();

      for (const attr of attrs) {
        if (attr.type !== 'JSXAttribute') continue;

        const name = getJsxAttributeName(attr);

        if (name.startsWith('passive:')) {
          passiveEvents.add(name.slice('passive:'.length));
        } else if (name.startsWith('preventdefault:')) {
          preventdefaultEvents.add(name.slice('preventdefault:'.length));
        }
      }

      for (const eventName of passiveEvents) {
        if (preventdefaultEvents.has(eventName)) {
          diagnostics.push(
            emitPassiveConflictWarning(eventName, file, buildHighlight(source, node.start, node.end)),
          );
        }
      }
    },
  });
}

/**
 * Single-pass collection of `CallExpression` callee sites whose callee is a
 * bare `Identifier` and whose name is in `names`. Returns a map keyed by
 * callee name. Replaces the per-name walk pattern (which was
 * O(target_count × programSize)).
 */
function collectCallSitesByName(
  program: AstProgram,
  names: Set<string>,
): Map<string, SourceRange[]> {
  const out = new Map<string, SourceRange[]>();
  walk(program, {
    enter(node: AstNode) {
      if (
        node.type !== 'CallExpression' ||
        node.callee?.type !== 'Identifier' ||
        !names.has(node.callee.name)
      ) return;
      const name = node.callee.name;
      const bucket = out.get(name);
      const entry = { start: node.callee.start, end: node.callee.end };
      if (bucket) bucket.push(entry);
      else out.set(name, [entry]);
    },
  });
  return out;
}

/**
 * Single-pass collection of the FIRST reference-site for each name in
 * `names` within a closure subtree. "Reference-site" excludes declaring
 * positions and non-computed property keys / member properties — same
 * exclusions the original per-name walker applied. Replaces the previous
 * per-name closure walk (which was O(target_count × subtreeSize)).
 */
function collectIdentifierReferenceSites(
  closureNode: AstFunction,
  names: Set<string>,
): Map<string, SourceRange> {
  const out = new Map<string, SourceRange>();
  if (names.size === 0) return out;
  let remaining = names.size;

  walk(closureNode, {
    enter(node: AstNode, parent: AstParentNode) {
      if (remaining === 0) return;
      if (node.type !== 'Identifier') return;
      const name = node.name;
      if (!names.has(name) || out.has(name)) return;
      if (isDeclaringOrMemberKey(node, parent)) return;
      out.set(name, { start: node.start, end: node.end });
      remaining--;
    },
  });

  return out;
}

function isDeclaringOrMemberKey(node: AstNode, parent: AstParentNode): boolean {
  if (!parent) return false;
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.id === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.id === node;
    case 'MemberExpression':
      return parent.property === node && !parent.computed;
    case 'Property':
      return parent.key === node;
    default:
      return false;
  }
}
