import { Project, ts } from 'ts-morph';
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
    let hasChanges = false;

    sourceFile.getImportDeclarations().forEach((importDeclaration) => {
      // startsWith is used in order to handle nested imports
      if (importDeclaration.getModuleSpecifierValue().startsWith(library)) {
        for (const [oldImport, newImport] of changes) {
          importDeclaration.getNamedImports().forEach((namedImport) => {
            if (namedImport.getName() === oldImport) {
              namedImport.setName(newImport);
              hasChanges = true;
            }
          });
        }
      }
    });

    sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier).forEach((identifier) => {
      for (const [oldImport, newImport] of changes) {
        if (identifier.getText() === oldImport) {
          identifier.replaceWithText(newImport);
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      sourceFile.saveSync();
      log.info(`Updated imports in ${sourceFile.getFilePath()}`);
    }
  });
}
