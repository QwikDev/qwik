import type { AstProgram, ModuleExportName } from '../../ast-types.js';
import { addBindingNamesFromPatternToSet } from './binding-pattern.js';

export interface SameFileSymbolInfo {
  sameFileExports: Set<string>;
  defaultExportedNames: Set<string>;
  renamedExports: Map<string, string>;
}

function getSpecifierName(specifier: ModuleExportName | null | undefined): string | undefined {
  if (specifier?.type === 'Identifier') {
    return specifier.name;
  }
  return specifier?.value;
}

/**
 * Collect top-level names that segment codegen may need to import back from the parent.
 * This includes exported names plus top-level declarations in the same module.
 */
export function collectSameFileSymbolInfo(program: AstProgram): SameFileSymbolInfo {
  const sameFileExports = new Set<string>();
  const defaultExportedNames = new Set<string>();
  const renamedExports = new Map<string, string>();

  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id?.name) {
          sameFileExports.add(node.declaration.id.name);
        } else if (node.declaration.type === 'VariableDeclaration') {
          for (const decl of node.declaration.declarations ?? []) {
            addBindingNamesFromPatternToSet(decl.id, sameFileExports);
          }
        } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id?.name) {
          sameFileExports.add(node.declaration.id.name);
        } else if (node.declaration.type === 'TSEnumDeclaration' && node.declaration.id?.name) {
          sameFileExports.add(node.declaration.id.name);
        }
      }

      for (const spec of node.specifiers ?? []) {
        const exportedName = getSpecifierName(spec.exported);
        if (exportedName) sameFileExports.add(exportedName);

        const localName = getSpecifierName(spec.local);
        if (localName && exportedName && localName !== exportedName) {
          sameFileExports.add(localName);
          renamedExports.set(localName, exportedName);
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if (
        (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
        decl.id?.name
      ) {
        sameFileExports.add(decl.id.name);
        defaultExportedNames.add(decl.id.name);
      }
    } else if (node.type === 'FunctionDeclaration' && node.id?.name) {
      sameFileExports.add(node.id.name);
    } else if (node.type === 'ClassDeclaration' && node.id?.name) {
      sameFileExports.add(node.id.name);
    } else if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations ?? []) {
        addBindingNamesFromPatternToSet(decl.id, sameFileExports);
      }
    } else if (node.type === 'TSEnumDeclaration' && node.id?.name) {
      sameFileExports.add(node.id.name);
    }
  }

  return {
    sameFileExports,
    defaultExportedNames,
    renamedExports,
  };
}
