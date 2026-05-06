import { visitNotIgnoredFiles } from './tools/visit-not-ignored-files';
import { log } from '@clack/prompts';

export async function replaceImportInFiles(
  changes: [oldImport: string, newImport: string][],
  library: string
) {
  const { Project, ts } = await import('ts-morph');
  const project = new Project();

  await visitNotIgnoredFiles('.', (path) => {
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) {
      return;
    }
    project.addSourceFileAtPath(path);
  });

  const sourceFiles = project.getSourceFiles();
  for (let i = 0; i < sourceFiles.length; i++) {
    const sourceFile = sourceFiles[i];
    let hasChanges = false;

    const importDeclarations = sourceFile.getImportDeclarations();
    for (let j = 0; j < importDeclarations.length; j++) {
      const importDeclaration = importDeclarations[j];
      // startsWith is used in order to handle nested imports
      if (importDeclaration.getModuleSpecifierValue().startsWith(library)) {
        for (let k = 0; k < changes.length; k++) {
          const [oldImport, newImport] = changes[k];

          const namedImports = importDeclaration.getNamedImports();
          for (let l = 0; l < namedImports.length; l++) {
            const namedImport = namedImports[l];
            if (namedImport.getName() === oldImport) {
              namedImport.setName(newImport);
              hasChanges = true;
            }
          }
        }
      }
    }

    const descendants = sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier);
    for (let m = 0; m < descendants.length; m++) {
      const identifier = descendants[m];
      for (let n = 0; n < changes.length; n++) {
        const [oldImport, newImport] = changes[n];
        if (identifier.getText() === oldImport) {
          identifier.replaceWithText(newImport);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      sourceFile.saveSync();
      log.info(`Updated imports in ${sourceFile.getFilePath()}`);
    }
  }
}
