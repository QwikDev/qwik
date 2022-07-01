export function getImportPath(importPath: string) {
  if (importPath.endsWith('.tsx') || importPath.endsWith('.jsx')) {
    return importPath.slice(0, importPath.length - 4);
  }
  if (importPath.endsWith('.ts')) {
    return importPath.slice(0, importPath.length - 3);
  }
  return importPath;
}
