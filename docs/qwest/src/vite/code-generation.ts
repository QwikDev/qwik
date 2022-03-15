import type { NormalizedPluginOptions, ParsedData } from './types';

export function createBuildCode(
  opts: NormalizedPluginOptions,
  data: ParsedData,
  inlineModules: boolean
) {
  const c = [];

  c.push(`export const LAYOUTS = {`);
  Object.entries(opts.layouts).forEach(([layoutName, layoutPath]) => {
    let importPath = layoutPath;
    if (importPath.endsWith('.tsx') || importPath.endsWith('.jsx')) {
      importPath = importPath.substring(0, importPath.length - 4);
    } else if (importPath.endsWith('.ts') || importPath.endsWith('.js')) {
      importPath = importPath.substring(0, importPath.length - 3);
    }

    c.push(`  ${JSON.stringify(layoutName)}: () => import(${JSON.stringify(importPath)}),`);
  });
  c.push(`};`);

  c.push(`export const INDEXES = {`);
  for (const i of data.indexes) {
    c.push(`  ${JSON.stringify(i.pathname)}: ${JSON.stringify(i)},`);
  }
  c.push(`};`);

  c.push(`export const PAGES = {`);
  if (inlineModules) {
    for (const p of data.pages) {
      c.push(`  ${JSON.stringify(p.pathname)}: () => import(${JSON.stringify(p.filePath)}),`);
    }
  }
  c.push(`};`);

  c.push(`export const INLINED_MODULES = ${JSON.stringify(inlineModules)};`);

  c.push(
    `export const BUILD_ID = ${JSON.stringify(
      Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
        .toString(36)
        .toLowerCase()
    )};`
  );

  return c.join('\n');
}
