import { getUndeclaredIdentifiersInFunction, walk } from 'oxc-walker';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstNode,
  AstParentNode,
  AstProgram,
  CallExpression,
  JSXOpeningElement,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import type { ExtractionResult } from '../extract.js';
import {
  classifyDeclarationType,
  emitC02,
  emitC05,
  emitPreventdefaultPassiveCheck,
} from '../diagnostics.js';
import { collectExportNames } from '../marker-detection.js';
import type { Diagnostic } from '../types.js';
import { computeLineColFromOffset } from '../utils/source-loc.js';

export function detectC02Diagnostics(
  extractions: ExtractionResult[],
  closureNodes: Map<string, AstFunction>,
  enclosingExtMap: Map<string, ExtractionResult>,
  bodyPrograms: Map<string, AstProgram>,
  importedNames: Set<string>,
  program: AstProgram,
  source: string,
  file: string,
  diagnostics: Diagnostic[],
): void {
  for (const extraction of extractions) {
    const closureNode = closureNodes.get(extraction.symbolName);
    if (!closureNode) continue;

    let undeclaredIds: string[];
    try {
      undeclaredIds = getUndeclaredIdentifiersInFunction(closureNode);
    } catch {
      continue;
    }
    if (undeclaredIds.length === 0) continue;

    const enclosingExt = enclosingExtMap.get(extraction.symbolName) ?? null;

    for (const refName of undeclaredIds) {
      if (importedNames.has(refName)) continue;

      let declType: 'var' | 'fn' | 'class';
      if (enclosingExt) {
        try {
          let encProgram = bodyPrograms.get(enclosingExt.symbolName);
          if (!encProgram) {
            const wrappedBody = `(${enclosingExt.bodyText})`;
            encProgram = parseWithRawTransfer('segment.tsx', wrappedBody).program;
            bodyPrograms.set(enclosingExt.symbolName, encProgram);
          }
          declType = classifyDeclarationType(encProgram, refName);
        } catch {
          declType = 'var';
        }
      } else {
        declType = classifyDeclarationType(program, refName);
      }

      if (declType === 'fn' || declType === 'class') {
        const site = findIdentifierReferenceSite(closureNode, refName);
        if (!site) {
          diagnostics.push(emitC02(refName, file, declType === 'class'));
          continue;
        }

        const [startLine, startCol] = computeLineColFromOffset(source, site.start);
        const [endLine, endCol] = computeLineColFromOffset(source, site.end);
        diagnostics.push(
          emitC02(refName, file, declType === 'class', {
            lo: site.start,
            hi: site.end,
            startLine,
            startCol,
            endLine,
            endCol,
          }),
        );
      }
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

  for (const exportName of moduleExportNames) {
    if (!exportName.endsWith('$')) continue;
    const importInfo = originalImports.get(exportName);
    if (importInfo?.isQwikCore) continue;
    const qrlName = exportName.slice(0, -1) + 'Qrl';
    if (moduleExportNames.has(qrlName)) continue;

    const callSites = findCallSites(program, exportName);
    for (const site of callSites) {
      const [startLine, startCol] = computeLineColFromOffset(source, site.start);
      const [endLine, endCol] = computeLineColFromOffset(source, site.end);
      diagnostics.push(
        emitC05(exportName, qrlName, file, {
          lo: site.start,
          hi: site.end,
          startLine,
          startCol,
          endLine,
          endCol,
        }),
      );
    }
  }
}

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

      for (const eventName of passiveEvents) {
        if (preventdefaultEvents.has(eventName)) {
          const [startLine, startCol] = computeLineColFromOffset(source, node.start);
          const [endLine, endCol] = computeLineColFromOffset(source, node.end);

          diagnostics.push(
            emitPreventdefaultPassiveCheck(eventName, file, {
              lo: node.start,
              hi: node.end,
              startLine,
              startCol,
              endLine,
              endCol,
            }),
          );
        }
      }
    },
  });
}

function findCallSites(
  program: AstProgram,
  funcName: string,
): Array<{ start: number; end: number }> {
  const sites: Array<{ start: number; end: number }> = [];
  walk(program, {
    enter(node: AstNode) {
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

function findIdentifierReferenceSite(
  closureNode: AstFunction,
  identName: string,
): { start: number; end: number } | null {
  let site: { start: number; end: number } | null = null;

  walk(closureNode, {
    enter(node: AstNode, parent: AstParentNode) {
      if (site || node.type !== 'Identifier' || node.name !== identName) return;

      if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent?.type === 'FunctionDeclaration' && parent.id === node) return;
      if (parent?.type === 'FunctionExpression' && parent.id === node) return;
      if (parent?.type === 'ClassDeclaration' && parent.id === node) return;
      if (parent?.type === 'ClassExpression' && parent.id === node) return;
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
      if ((parent?.type === 'Property') && parent.key === node) return;

      site = { start: node.start, end: node.end };
    },
  });

  return site;
}
