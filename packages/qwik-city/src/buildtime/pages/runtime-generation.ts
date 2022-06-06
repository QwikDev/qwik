import type { BuildContext } from '../types';

export function createDynamicImportedRuntime(ctx: BuildContext) {
  const c: string[] = [];

  c.push(`export const LAYOUTS = {`);
  ctx.layouts.forEach((layout) => {
    const importPath = getImportPath(layout.path);
    c.push(`  ${JSON.stringify(layout.id)}: () => import(${JSON.stringify(importPath)}),`);
  });
  c.push(`};`);

  c.push(`export const PAGES = {`);
  for (const p of ctx.pages) {
    c.push(
      `  ${JSON.stringify(p.route.pathname)}: () => import(${JSON.stringify(p.route.pathname)}),`
    );
  }
  c.push(`};`);

  c.push(`export const INLINED_MODULES = false;`);

  c.push(...createPageIndex(ctx));

  c.push(createBuildId());

  return c.join('\n');
}

export function createInlinedRuntime(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  c.push(`export const LAYOUTS = {`);
  ctx.layouts.forEach((layout) => {
    const importPath = getImportPath(layout.path);
    const importName = `layout_${layout.id}`;
    esmImports.push(`import ${importName} from ${JSON.stringify(importPath)};`);
    c.push(`  ${JSON.stringify(layout.id)}: () => ${importName},`);
  });
  c.push(`};`);

  c.push(`export const PAGES = {`);
  for (const p of ctx.pages) {
    c.push(
      `  ${JSON.stringify(p.route.pathname)}: () => import(${JSON.stringify(p.route.pathname)}),`
    );
  }
  c.push(`};`);

  c.push(`export const INLINED_MODULES = true;`);

  c.push(...createPageIndex(ctx));

  c.push(createBuildId());

  return esmImports.join('\n') + c.join('\n');
}

function createPageIndex(ctx: BuildContext) {
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
