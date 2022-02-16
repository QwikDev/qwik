import type { NormalizedPluginOptions, ParsedData } from './types';

export function createDevCode(opts: NormalizedPluginOptions, data: ParsedData) {
  const c = [];

  c.push(...createLayoutsCode(opts));

  c.push(`const PAGES = {`);
  for (const p of data.pages) {
    c.push(`  ${JSON.stringify(p.pathname)}: () => import(${JSON.stringify(p.filePath)}),`);
  }
  c.push(`};`);

  c.push(`export const loadPage = async (opts) => {`);
  // c.push(`  debugger;`);
  c.push(`  const pageImporter = PAGES[opts.pathname];`);
  c.push(`  if (!pageImporter) {`);
  c.push(`    return null;`);
  c.push(`  }`);
  c.push(`  const mod = await pageImporter();`);
  c.push(`  if (!mod || !mod.default) {`);
  c.push(`    return null;`);
  c.push(`  }`);
  c.push(`  const layoutImporter = LAYOUTS[mod.layout] || LAYOUTS.default;`);
  c.push(`  if (!layoutImporter) {`);
  c.push(`    return null;`);
  c.push(`  }`);
  c.push(`  const meta = {};`);
  c.push(`  for (const k in mod) {`);
  c.push(`    if (k !== 'default') {`);
  c.push(`      meta[k] = mod[k];`);
  c.push(`    }`);
  c.push(`  }`);
  c.push(`  const layout = await layoutImporter();`);
  c.push(`  const page = {`);
  c.push(`    getContent: () => mod.default,`);
  c.push(`    getLayout: () => layout.default,`);
  c.push(`    getMetadata: () => meta`);
  c.push(`  };`);
  c.push(`  return page;`);
  c.push(`};`);

  c.push(`const INDEXES = {`);
  for (const i of data.indexes) {
    c.push(`  ${JSON.stringify(i.pathname)}: ${JSON.stringify(i)},`);
  }
  c.push(`};`);

  c.push(`export const loadIndex = async (opts) => {`);
  // c.push(`  debugger;`);
  c.push(`  let pathname = opts.pathname;`);
  c.push(`  for (let i = 0; i < 9; i++) {`);
  c.push(`    const index = INDEXES[pathname];`);
  c.push(`    if (index) {`);
  c.push(`      return index;`);
  c.push(`    }`);
  c.push(`    const parts = pathname.split('/');`);
  c.push(`    parts.pop();`);
  c.push(`    pathname = parts.join('/');`);
  c.push(`    if (pathname === '/') break;`);
  c.push(`  }`);
  c.push(`  return null;`);
  c.push(`};`);

  const code = c.join('\n');

  return code;
}

export function createProdCode(opts: NormalizedPluginOptions, data: ParsedData) {
  const c = [];

  c.push(...createLayoutsCode(opts));

  c.push(`export const loadPage = async (opts) => {`);
  c.push(`  const pagePath = "/pages" + opts.pathname + '.js'`);
  c.push(`  const mod = await import(pagePath);`);
  c.push(`  if (!mod || !mod.default) {`);
  c.push(`    return null;`);
  c.push(`  }`);
  c.push(`  const meta = {};`);
  c.push(`  for (const k in mod) {`);
  c.push(`    if (k !== 'default') {`);
  c.push(`      meta[k] = mod[k];`);
  c.push(`    }`);
  c.push(`  }`);
  c.push(`  const layoutImporter = LAYOUTS[mod.layout] || LAYOUTS.default;`);
  c.push(`  const page = {`);
  c.push(`    getComponent: () => {`);
  c.push(`      `);
  c.push(`    },`);
  c.push(`    getMetadata: () => Promise.resolve(meta)`);
  c.push(`  };`);
  c.push(`  return page;`);
  c.push(`};`);

  c.push(`const INDEXES = ${JSON.stringify(data.indexes)};`);

  c.push(`export const loadIndex = async (opts) => {`);
  c.push(`  const index = INDEXES[opts.pathname];`);
  c.push(`  return index;`);
  c.push(`};`);

  const code = c.join('\n');

  return code;
}

function createLayoutsCode(opts: NormalizedPluginOptions) {
  const c: string[] = [];
  c.push(`const LAYOUTS = {`);
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
  return c;
}
