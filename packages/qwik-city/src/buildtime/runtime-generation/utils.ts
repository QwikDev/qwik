export function createBuildId(c: string[]) {
  const id = `export const buildId = ${JSON.stringify(
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .toLowerCase()
  )};`;

  c.push(id);
}

export function getImportPath(importPath: string) {
  if (importPath.endsWith('.tsx') || importPath.endsWith('.jsx')) {
    return importPath.slice(0, importPath.length - 4);
  }
  if (importPath.endsWith('.ts')) {
    return importPath.slice(0, importPath.length - 3);
  }
  return importPath;
}

export function createQwikManifest(c: string[]) {
  c.push(`export { manifest } from '@qwik-client-manifest';`);
}
