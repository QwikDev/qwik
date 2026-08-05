import { applySourceEdits } from '../parse/sourceEdits';
import type { SourceEdit } from '../parse/types';
import { parseProgram, traverseProgram } from '../parse/traverse';
import { PERF_VIRTUAL_ID, log } from '../plugin/statistics/constants';

export function rewriteComponentQrlImport(
  code: string,
  id: string
): { code: string; changed: boolean } {
  if (!code.includes('@qwik.dev/core') || !code.includes('componentQrl')) {
    return { code, changed: false };
  }

  const program = parseProgram(code);
  const edits: SourceEdit[] = [];

  traverseProgram(program, {
    ImportDeclaration(path) {
      const node = path.node as ImportDeclarationNode;
      if (node.source?.value !== '@qwik.dev/core') {
        return;
      }
      if (node.importKind === 'type') {
        return;
      }

      const componentQrlSpecifier = node.specifiers?.find(isComponentQrlSpecifier);
      if (!componentQrlSpecifier) {
        return;
      }

      const preservedSpecifiers =
        node.specifiers
          ?.filter((specifier) => specifier !== componentQrlSpecifier)
          .map((specifier) => sliceNode(code, specifier))
          .filter(Boolean) ?? [];

      edits.push({
        kind: 'replace',
        start: node.start,
        end: node.end,
        text: createComponentQrlImportReplacement(preservedSpecifiers),
      });

      log('rewrite componentQrl import %O', { id });
      path.skip();
    },
  });

  if (edits.length === 0) {
    return { code, changed: false };
  }

  return { code: applySourceEdits(code, edits), changed: true };
}

interface ImportDeclarationNode {
  type: 'ImportDeclaration';
  specifiers?: ImportSpecifierNode[];
  source?: {
    value?: unknown;
  };
  importKind?: string;
  start: number;
  end: number;
}

interface ImportSpecifierNode {
  type: string;
  imported?: {
    name?: string;
    value?: unknown;
  };
  local?: {
    name?: string;
  };
  importKind?: string;
  start: number;
  end: number;
}

function isComponentQrlSpecifier(specifier: ImportSpecifierNode): boolean {
  return (
    specifier.type === 'ImportSpecifier' &&
    specifier.importKind !== 'type' &&
    getImportedName(specifier) === 'componentQrl' &&
    specifier.local?.name === 'componentQrl'
  );
}

function getImportedName(specifier: ImportSpecifierNode): string | undefined {
  if (specifier.imported?.name) {
    return specifier.imported.name;
  }
  if (typeof specifier.imported?.value === 'string') {
    return specifier.imported.value;
  }
  return undefined;
}

function sliceNode(code: string, node: { start: number; end: number }): string {
  return code.slice(node.start, node.end).trim();
}

function createComponentQrlImportReplacement(preservedSpecifiers: string[]): string {
  const componentQrlImport = `import { componentQrl } from '${PERF_VIRTUAL_ID}'`;
  if (preservedSpecifiers.length === 0) {
    return componentQrlImport;
  }

  return [
    `import { ${preservedSpecifiers.join(', ')} } from '@qwik.dev/core';`,
    componentQrlImport,
  ].join('\n');
}
