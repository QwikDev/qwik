/**
 * Post-transform import re-collection for segment code generation.
 *
 * After body transforms (JSX, nested calls, sync$), the segment body may
 * reference identifiers not in the original segmentImports. This module
 * scans the final body text and adds missing imports.
 */

import { createRegExp, oneOrMore, wordChar, wordBoundary, global } from 'magic-regexp';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import type { AstFunction, AstNode } from '../../ast-types.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import { rewriteImportSource } from '../rewrite-imports.js';
import { getQrlCalleeName } from '../utils/qrl-naming.js';
import { getQrlImportSource } from '../rewrite-calls.js';
import type { NestedCallSiteInfo, SegmentImportData } from '../segment-codegen.js';
import { insertImportBeforeSeparator } from './body-transforms.js';

interface SegmentImportSpec {
  localName: string;
  importedName: string;
}

const qrlSuffixPattern = createRegExp(
  wordBoundary.and(oneOrMore(wordChar).and('Qrl').grouped()).and(wordBoundary),
  [global],
);

/**
 * Parse a body text string and extract all referenced Identifier and JSXIdentifier names.
 * Used to determine which imports a segment body needs after all transforms.
 */
function collectBodyIdentifiers(bodyText: string): Set<string> {
  const ids = new Set<string>();
  try {
    const wrapped = `(${bodyText})`;
    const parsed = parseWithRawTransfer('segment.tsx', wrapped);

    let funcNode: AstFunction | null = null;
    walk(parsed.program, {
      enter(node: AstNode) {
        if (!funcNode && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression')) {
          funcNode = node;
        }
        if (node.type === 'JSXIdentifier' && node.name && node.name[0] >= 'A' && node.name[0] <= 'Z') {
          ids.add(node.name);
        }
      }
    });

    if (funcNode) {
      const undeclared = getUndeclaredIdentifiersInFunction(funcNode);
      for (const name of undeclared) ids.add(name);
    } else {
      walk(parsed.program, {
        enter(node: AstNode) {
          if (node.type === 'Identifier' && node.name) ids.add(node.name);
        }
      });
    }
  } catch {
    // Matches identifiers starting with uppercase, _ or $. Fallback when AST parse fails.
    // Not converted to magic-regexp: charIn() escapes hyphens, breaking character ranges.
    const identRegex = /\b([A-Z_$][a-zA-Z0-9_$]*)\b/g;
    let match;
    while ((match = identRegex.exec(bodyText)) !== null) ids.add(match[1]);
  }
  return ids;
}

/**
 * Scan the final body text for identifiers that need imports not already present.
 * Catches same-file components, namespace imports, _auto_ migration imports,
 * and Qrl-suffixed runtime imports from nested call rewriting.
 */
export function recollectPostTransformImports(
  bodyText: string,
  parts: string[],
  importContext: SegmentImportData,
  importsBySource: Map<string, SegmentImportSpec[]>,
  capturedNames: Set<string>,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
): void {
  const bodyIdentifiers = collectBodyIdentifiers(bodyText);

  for (const id of bodyIdentifiers) {
    if (capturedNames.has(id)) continue;

    let alreadyImported = false;
    for (const specs of importsBySource.values()) {
      if (specs.some(s => s.localName === id)) { alreadyImported = true; break; }
    }
    if (alreadyImported) continue;
    if (partsHaveImport(parts, id)) continue;

    const moduleImp = importContext.moduleImports.find(m => m.localName === id);
    if (moduleImp) {
      let importStmt = buildModuleImportStatement(moduleImp);
      if (moduleImp.importAttributes) {
        const attrs = Object.entries(moduleImp.importAttributes).map(([k, v]) => `${k}: "${v}"`).join(', ');
        importStmt = importStmt.replace('";', `" with { ${attrs} };`);
      }
      insertImportBeforeSeparator(parts, importStmt);
      continue;
    }

    if (importContext.sameFileSymbols.has(id)) {
      addSameFileImport(parts, id, importContext);
    }
  }

  addQrlCalleeImports(parts, bodyText, nestedCallSites, importContext);
}

function partsHaveImport(parts: string[], symbol: string): boolean {
  return parts.some(p =>
    p.includes(`{ ${symbol} }`) || p.includes(`{ ${symbol},`) ||
    p.includes(`, ${symbol} }`) || p.includes(`, ${symbol},`) ||
    p.includes(`as ${symbol}`) || p.includes(`* as ${symbol}`),
  );
}

function buildModuleImportStatement(imp: { localName: string; importedName: string; source: string }): string {
  const rewrittenSource = rewriteImportSource(imp.source);
  if (imp.importedName === '*') return `import * as ${imp.localName} from "${rewrittenSource}";`;
  if (imp.importedName === 'default') return `import ${imp.localName} from "${rewrittenSource}";`;
  if (imp.importedName !== imp.localName) return `import { ${imp.importedName} as ${imp.localName} } from "${rewrittenSource}";`;
  return `import { ${imp.localName} } from "${rewrittenSource}";`;
}

function addSameFileImport(parts: string[], id: string, importContext: SegmentImportData): void {
  const migrationDecision = importContext.migrationDecisions.find(d => d.varName === id);
  if (migrationDecision && migrationDecision.action === 'move') return;

  if (migrationDecision && migrationDecision.action === 'reexport' && !migrationDecision.isExported) {
    insertImportBeforeSeparator(parts, `import { _auto_${id} as ${id} } from "${importContext.parentModulePath}";`);
    return;
  }
  if (importContext.defaultExportedNames?.has(id)) {
    insertImportBeforeSeparator(parts, `import { default as ${id} } from "${importContext.parentModulePath}";`);
    return;
  }
  if (importContext.renamedExports?.has(id)) {
    const exportedAs = importContext.renamedExports.get(id)!;
    insertImportBeforeSeparator(parts, `import { ${exportedAs} as ${id} } from "${importContext.parentModulePath}";`);
    return;
  }
  insertImportBeforeSeparator(parts, `import { ${id} } from "${importContext.parentModulePath}";`);
}

function addQrlCalleeImports(
  parts: string[],
  bodyText: string,
  nestedCallSites: NestedCallSiteInfo[] | undefined,
  _importContext: SegmentImportData,
): void {
  if (!nestedCallSites) {
    qrlSuffixPattern.lastIndex = 0;
    const qrlSuffixRegex = qrlSuffixPattern;
      let qrlMatch;
      while ((qrlMatch = qrlSuffixRegex.exec(bodyText)) !== null) {
        const qrlName = qrlMatch[1];
        if (parts.some(p => p.includes(qrlName))) continue;
        const markerName = `${qrlName.slice(0, -3)}$`;
        if (getQrlCalleeName(markerName) === qrlName) {
          const importSource = getQrlImportSource(qrlName);
          insertImportBeforeSeparator(parts, `import { ${qrlName} } from "${importSource}";`);
        }
      }
    return;
  }

  const addedQrlCallees = new Set<string>();
  for (const site of nestedCallSites) {
    if (!site.qrlCallee || addedQrlCallees.has(site.qrlCallee)) continue;
    addedQrlCallees.add(site.qrlCallee);
    if (parts.some(p => p.includes(site.qrlCallee!))) continue;
    const importSource = getQrlImportSource(site.qrlCallee!, site.importSource);
    insertImportBeforeSeparator(parts, `import { ${site.qrlCallee} } from "${importSource}";`);
  }
}
