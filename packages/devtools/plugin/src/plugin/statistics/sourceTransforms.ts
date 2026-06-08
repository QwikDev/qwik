import perfLazyWrapperPreamble from '../../virtualmodules/perfLazyWrapperPreamble';
import { applySourceEdits } from '../../parse/sourceEdits';
import type { SourceEdit } from '../../parse/types';
import { parseProgram, traverseProgram } from '../../parse/traverse';
import { isVirtualModuleRequest, normalizeVirtualModuleId } from '../../virtualmodules/ids';
import { PERF_VIRTUAL_ID, log } from './constants';

export { rewriteComponentQrlImport } from '../../transforms/rewrite-component-qrl-import';

export function shouldTransformStatisticsSource(id: string): boolean {
  const cleanId = normalizeVirtualModuleId(id);
  return !isFromNodeModules(cleanId) && !isDevtoolsUiSource(cleanId);
}

export function isPerfVirtualModuleId(id: string): boolean {
  return isVirtualModuleRequest(id, PERF_VIRTUAL_ID);
}

export function findQwikLazyComponentExports(code: string): string[] {
  const exports: string[] = [];

  try {
    const program = parseProgram(code);
    traverseProgram(program, {
      ExportNamedDeclaration(path) {
        const node = path.node as ExportNamedDeclarationNode;
        const declaration = node.declaration;
        if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
          return;
        }

        for (const declarator of declaration.declarations ?? []) {
          const name = getIdentifierName(declarator.id);
          if (name && isQwikLazyComponentExportName(name)) {
            exports.push(name);
          }
        }
      },
    });
  } catch (_) {
    return [];
  }

  return exports;
}

export function wrapQwikLazyComponentExports(params: {
  code: string;
  id: string;
  exports: string[];
}): { code: string; changed: boolean } {
  const { code, exports, id } = params;
  if (exports.length === 0) {
    return { code, changed: false };
  }

  log('wrap _component_ exports %O', { id, count: exports.length });

  const exportSet = new Set(exports);
  const edits: SourceEdit[] = [];
  const wrappedExports: string[] = [];

  try {
    const program = parseProgram(code);
    traverseProgram(program, {
      ExportNamedDeclaration(path) {
        const node = path.node as ExportNamedDeclarationNode;
        const declaration = node.declaration;
        if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') {
          return;
        }
        if ((declaration.declarations?.length ?? 0) !== 1) {
          return;
        }

        const declarator = declaration.declarations![0];
        const exportName = getIdentifierName(declarator.id);
        if (
          !exportName ||
          !exportSet.has(exportName) ||
          typeof declarator.init?.start !== 'number'
        ) {
          return;
        }

        edits.push({
          kind: 'replace',
          start: node.start,
          end: declarator.init.start,
          text: `const __original_${exportName}__ = `,
        });
        wrappedExports.push(exportName);
      },
    });
  } catch (_) {
    return { code, changed: false };
  }

  if (edits.length === 0) {
    return { code, changed: false };
  }

  let modifiedCode = perfLazyWrapperPreamble + applySourceEdits(code, edits);
  for (const exportName of wrappedExports) {
    modifiedCode = appendWrappedExport(modifiedCode, exportName, id);
  }
  return { code: modifiedCode, changed: true };
}

function isFromNodeModules(cleanId: string): boolean {
  return cleanId.includes('/node_modules/') || cleanId.includes('\\node_modules\\');
}

function isDevtoolsUiSource(cleanId: string): boolean {
  return (
    cleanId.includes('/packages/devtools/ui/src/') ||
    cleanId.includes('/packages/devtools/ui/lib/') ||
    cleanId.includes('\\packages\\devtools\\ui\\src\\') ||
    cleanId.includes('\\packages\\devtools\\ui\\lib\\')
  );
}

function appendWrappedExport(code: string, exportName: string, id: string): string {
  const serializedExportName = JSON.stringify(exportName);
  const serializedId = JSON.stringify(id);
  return `${code}
export const ${exportName} = __qwik_wrap__(__original_${exportName}__, ${serializedExportName}, ${serializedId});
`;
}

function isQwikLazyComponentExportName(name: string): boolean {
  return /^\w+_component_\w+$/.test(name);
}

function getIdentifierName(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const record = node as { type?: string; name?: string };
  return record.type === 'Identifier' ? record.name : undefined;
}

interface ExportNamedDeclarationNode {
  type: 'ExportNamedDeclaration';
  start: number;
  declaration?: VariableDeclarationNode;
}

interface VariableDeclarationNode {
  type: 'VariableDeclaration';
  kind?: string;
  declarations?: VariableDeclaratorNode[];
}

interface VariableDeclaratorNode {
  id?: unknown;
  init?: {
    start?: number;
  };
}
