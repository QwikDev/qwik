import { log } from '@clack/prompts';
import type { SourceFile } from 'ts-morph';
import { getProjectSourceFiles } from './rename-import';

const ROUTER_PACKAGES = ['@builder.io/qwik-city', '@qwik.dev/router'];

/** The router no longer re-exports `z`, so import it from `zod` directly. */
export function moveZodImport(sourceFile: SourceFile): boolean {
  let hasChanges = false;
  const importDeclarations = sourceFile.getImportDeclarations();
  for (let i = 0; i < importDeclarations.length; i++) {
    const importDeclaration = importDeclarations[i];
    if (!ROUTER_PACKAGES.includes(importDeclaration.getModuleSpecifierValue())) {
      continue;
    }
    const zImport = importDeclaration.getNamedImports().find((named) => named.getName() === 'z');
    if (!zImport) {
      continue;
    }
    const alias = zImport.getAliasNode()?.getText();
    const isTypeOnly = importDeclaration.isTypeOnly();
    zImport.remove();
    const isEmptyImport =
      importDeclaration.getNamedImports().length === 0 &&
      !importDeclaration.getDefaultImport() &&
      !importDeclaration.getNamespaceImport();
    if (isEmptyImport) {
      importDeclaration.remove();
    }
    sourceFile.addImportDeclaration({
      isTypeOnly,
      moduleSpecifier: 'zod',
      namedImports: [{ name: 'z', alias }],
    });
    hasChanges = true;
  }
  return hasChanges;
}

/** Returns whether the app uses Zod with the router, so `zod` must be installed. */
export async function moveZodImportInFiles(): Promise<boolean> {
  let usesZod = false;
  const sourceFiles = await getProjectSourceFiles();
  for (let i = 0; i < sourceFiles.length; i++) {
    const sourceFile = sourceFiles[i];
    const hasMovedImport = moveZodImport(sourceFile);
    if (hasMovedImport) {
      sourceFile.saveSync();
      log.info(`Moved the "z" import to "zod" in ${sourceFile.getFilePath()}`);
    }
    usesZod ||= hasMovedImport || sourceFile.getFullText().includes('zod$');
  }
  return usesZod;
}
