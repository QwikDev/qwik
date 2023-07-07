export function getImportPath(importPath: string) {
  const lowerCasePath = importPath.toLowerCase();
  if (lowerCasePath.endsWith('.tsx') || lowerCasePath.endsWith('.jsx')) {
    return importPath.slice(0, importPath.length - 4);
  }
  if (lowerCasePath.endsWith('.ts')) {
    return importPath.slice(0, importPath.length - 3);
  }
  return importPath;
}
