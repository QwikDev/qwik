import { Node, Project, type SourceFile, ts } from 'ts-morph';
import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';
import { log } from '@clack/prompts';

export function replaceImportInFiles(
  changes: [oldImport: string, newImport: string][],
  library: string
) {
  const project = new Project();

  visitNotIgnoredFiles('.', (path) => {
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) {
      return;
    }
    project.addSourceFileAtPath(path);
  });

  project.getSourceFiles().forEach((sourceFile) => {
    if (renameImports(sourceFile, changes, library)) {
      sourceFile.saveSync();
      log.info(`Updated imports in ${sourceFile.getFilePath()}`);
    }
  });
}

/**
 * Renames the imports of `library` (and its subpaths) in a file. Usages are only renamed when the
 * import is not aliased, and only in files that import the name from `library`.
 */
export function renameImports(
  sourceFile: SourceFile,
  changes: [oldImport: string, newImport: string][],
  library: string
): boolean {
  const renames = new Map<string, string>();
  let changed = false;

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    // startsWith is used in order to handle nested imports
    if (!importDeclaration.getModuleSpecifierValue().startsWith(library)) {
      continue;
    }
    for (const [oldImport, newImport] of changes) {
      for (const namedImport of importDeclaration.getNamedImports()) {
        if (namedImport.getName() === oldImport) {
          namedImport.setName(newImport);
          changed = true;
          if (!namedImport.getAliasNode()) {
            renames.set(oldImport, newImport);
          }
        }
      }
      const defaultImport = importDeclaration.getDefaultImport();
      if (defaultImport?.getText() === oldImport) {
        renames.set(oldImport, newImport);
      }
    }
  }

  for (const identifier of sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier)) {
    if (identifier.wasForgotten()) {
      continue;
    }
    const newName = renames.get(identifier.getText());
    if (!newName || !isReference(identifier)) {
      continue;
    }
    const parent = identifier.getParent();
    if (Node.isShorthandPropertyAssignment(parent)) {
      // keep the property key: `{ oldName }` -> `{ oldName: newName }`
      parent.replaceWithText(`${identifier.getText()}: ${newName}`);
    } else {
      identifier.replaceWithText(newName);
    }
    changed = true;
  }
  return changed;
}

/** Excludes identifiers that are property names, e.g. `a.oldName` or `{ oldName: 1 }`. */
function isReference(identifier: Node) {
  const parent = identifier.getParent();
  if (
    Node.isPropertyAccessExpression(parent) ||
    Node.isPropertyAssignment(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isPropertyDeclaration(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isMethodSignature(parent) ||
    Node.isJsxAttribute(parent)
  ) {
    return (parent as any).getNameNode() !== identifier;
  }
  if (Node.isQualifiedName(parent)) {
    return parent.getLeft() === identifier;
  }
  return !Node.isImportSpecifier(parent);
}
