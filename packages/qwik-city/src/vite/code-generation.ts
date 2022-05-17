import type { PluginContext } from './types';

export function createDynamicImportedCode(ctx: PluginContext) {
  const c: string[] = [];

  c.push(`export const LAYOUTS = {`);
  Object.entries(ctx.opts.layouts).forEach(([layoutName, layoutPath]) => {
    const importPath = getImportPath(layoutPath);
    c.push(`  ${JSON.stringify(layoutName)}: () => import(${JSON.stringify(importPath)}),`);
  });
  c.push(`};`);

  c.push(`export const PAGES = {`);
  for (const p of ctx.pages) {
    c.push(`  ${JSON.stringify(p.pathname)}: () => import(${JSON.stringify(p.filePath)}),`);
  }
  c.push(`};`);

  c.push(`export const INLINED_MODULES = false;`);

  c.push(...createPageIndex(ctx));

  c.push(createBuildId());

  return c.join('\n');
}

export function createInlinedCode(ctx: PluginContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  c.push(`export const LAYOUTS = {`);
  Object.entries(ctx.opts.layouts).forEach(([layoutName, layoutPath], index) => {
    const importPath = getImportPath(layoutPath);

    const importName = `layout_${index}`;
    esmImports.push(`import ${importName} from ${JSON.stringify(importPath)};`);
    c.push(`  ${JSON.stringify(layoutName)}: () => ${importName},`);
  });
  c.push(`};`);

  c.push(`export const PAGES = {`);
  let importPageIndex = 0;
  for (const p of ctx.pages) {
    const importName = `page_${importPageIndex++}`;
    esmImports.push(`import ${importName} from ${JSON.stringify(p.filePath)};`);
    c.push(`  ${JSON.stringify(p.pathname)}: () => import(${JSON.stringify(p.filePath)}),`);
  }
  c.push(`};`);

  c.push(`export const INLINED_MODULES = true;`);

  c.push(...createPageIndex(ctx));

  c.push(createBuildId());

  return esmImports.join('\n') + c.join('\n');
}

function createPageIndex(ctx: PluginContext) {
  const c: string[] = [];
  c.push(`export const INDEXES = {`);
  for (const i of ctx.indexes) {
    c.push(`  ${JSON.stringify(i.pathname)}: ${JSON.stringify(i)},`);
  }
  c.push(`};`);
  return c;
}

function createBuildId() {
  return `export const BUILD_ID = ${JSON.stringify(
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .toLowerCase()
  )};`;
}

function getImportPath(importPath: string) {
  if (importPath.endsWith('.tsx') || importPath.endsWith('.jsx')) {
    return importPath.substring(0, importPath.length - 4);
  }
  if (importPath.endsWith('.ts') || importPath.endsWith('.js')) {
    return importPath.substring(0, importPath.length - 3);
  }
  return importPath;
}
