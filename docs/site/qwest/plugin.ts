import { readdir, stat, readFile } from 'fs/promises';
import { isAbsolute, join, extname, basename, dirname } from 'path';
import frontmatter from 'front-matter';
import type { PluginOptions, NormalizedPluginOptions } from './types';
import type { Plugin, ViteDevServer } from 'vite';
import slugify from 'slugify';
import { ModuleNode } from 'vite';
import { ModuleGraph } from 'vite';

export function qwest(options: PluginOptions) {
  const opts = normalizeOptions(options);
  let qwestCode: string | null = null;
  let server: ViteDevServer | undefined;
  let hasValidatedOpts = false;

  const plugin: Plugin = {
    name: 'qwest-plugin',

    configureServer(viteServer) {
      server = viteServer;
    },

    handleHotUpdate(ctx) {
      const changedFile = ctx.file;
      if (server && typeof changedFile === 'string') {
        const moduleGraph = server.moduleGraph;
        const qwestMod = moduleGraph.getModuleById(RESOLVED_QWEST_ID);
        if (isMarkdownFile(opts, changedFile) || isQuestModuleDependency(qwestMod, changedFile)) {
          invalidateModule(moduleGraph, qwestMod);
        }
      }
    },

    async buildStart() {
      qwestCode = null;
      if (!hasValidatedOpts) {
        const err = await validatePlugin(opts);
        if (err) {
          this.error(err);
        } else {
          hasValidatedOpts = true;
        }
      }
    },

    resolveId(id) {
      if (QWEST_ID === id) {
        return RESOLVED_QWEST_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QWEST_ID) {
        if (qwestCode == null) {
          const pages = await getPages(opts, opts.pagesDir, []);
          const pagesSet = new Set(pages.map((p) => p.filePath));
          pages.forEach((p) => {
            this.addWatchFile(p.filePath);
          });
          qwestCode = loadQwest(opts, pages);

          if (server) {
            const mod = server.moduleGraph.getModuleById(id);
            server.moduleGraph.updateModuleInfo(mod!, pagesSet, pagesSet, true);
          }
        }
        return qwestCode;
      }
      return null;
    },
  };

  return plugin as any;
}

function invalidateModule(moduleGraph: ModuleGraph, qwestMod: ModuleNode | undefined) {
  const checkedFiles = new Set<string>();
  const invalidate = (mod: ModuleNode | undefined) => {
    if (mod && mod.file && !checkedFiles.has(mod.file)) {
      checkedFiles.add(mod.file);
      moduleGraph.invalidateModule(mod);
      mod.importedModules.forEach(invalidate);
    }
  };
  invalidate(qwestMod);
}

function isQuestModuleDependency(qwestMod: ModuleNode | undefined, changedFile: string) {
  const checkedFiles = new Set<string>();
  let isDep = false;
  const checkDep = (mod: ModuleNode | undefined) => {
    if (!isDep && mod && mod.file && !checkedFiles.has(mod.file)) {
      checkedFiles.add(mod.file);
      if (mod.file === changedFile) {
        isDep = true;
      } else {
        mod.importedModules.forEach(checkDep);
      }
    }
  };
  checkDep(qwestMod);
  return isDep;
}

async function getPages(opts: NormalizedPluginOptions, dir: string, pages: ParsedPage[]) {
  const items = await readdir(dir);
  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE_NAMES[itemName]) {
        const itemPath = join(dir, itemName);
        const ext = extname(itemName);

        if (isMarkdownFile(opts, itemName)) {
          const page = await parsePage(opts, itemPath);
          if (page) {
            pages.push(page);
          }
        } else if (!IGNORE_EXT[ext]) {
          const s = await stat(itemPath);
          if (s.isDirectory()) {
            await getPages(opts, itemPath, pages);
          }
        }
      }
    })
  );
  return pages;
}

async function parsePage(opts: NormalizedPluginOptions, filePath: string) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = frontmatter<any>(content);
    if (parsed && parsed.attributes) {
      return getPage(opts, filePath, parsed.attributes);
    }
  } catch (e) {
    console.error(filePath, e);
  }
}

function getPage(opts: NormalizedPluginOptions, filePath: string, attrs: PageAttributes) {
  const id = getPageId(filePath, attrs);
  const pathname = getPagePathname(filePath, id, attrs);
  const title = getPageTitle(id, attrs);
  const layout = getPageLayout(opts, attrs);

  delete attrs.id;
  delete attrs.pathname;
  delete attrs.title;
  delete attrs.layout;

  const page: ParsedPage = {
    id,
    pathname,
    title,
    layout,
    filePath,
  };
  return page;
}

function getPageId(filePath: string, attrs: PageAttributes) {
  let id = '';
  if (typeof attrs.id === 'string' && attrs.id) {
    id = attrs.id!;
  } else {
    let fileName = getFileName(filePath);
    if (fileName === 'index') {
      const dir = dirname(filePath);
      fileName = getFileName(dir);
    }
    id = fileName;
  }
  id = slugify(id);
  return id;
}

function getPagePathname(filePath: string, id: string, attrs: PageAttributes) {
  let pathname = '';
  if (typeof attrs.pathname === 'string' && attrs.pathname) {
    pathname = attrs.pathname!;
  } else {
    pathname = id;
  }

  const paths = pathname
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => slugify(p, { lower: true }));

  return '/' + paths.join('/');
}

function getPageTitle(id: string, attrs: PageAttributes) {
  let title = '';
  if (typeof attrs.title === 'string' && attrs.title) {
    title = attrs.title!;
  } else {
    title = toTitleCase(id.replace(/-/g, ' '));
  }
  title = title.trim();
  return title;
}

function getPageLayout(opts: NormalizedPluginOptions, attrs: PageAttributes) {
  let layout = 'default';
  if (opts.layouts[attrs.layout!]) {
    layout = attrs.layout!;
  }
  return layout;
}

function getFileName(filePath: string) {
  if (filePath.endsWith('.md')) {
    return basename(filePath, '.md');
  }
  if (filePath.endsWith('.mdx')) {
    return basename(filePath, '.mdx');
  }
  return basename(filePath);
}

function getLayoutVarName(layoutName: string) {
  layoutName = slugify(layoutName, { replacement: '_' });
  return `QUEST_LAYOUT_${layoutName}`;
}

function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, function (txt: string) {
    return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
  });
}

function loadQwest(opts: NormalizedPluginOptions, pages: ParsedPage[]) {
  const c = [];

  c.push(`import { getQuestPage, getQuestNavItems } from '${join(__dirname, 'util')}';`);

  Object.entries(opts.layouts).forEach(([layoutName, layoutPath]) => {
    let path = layoutPath;
    if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
      path = path.substring(0, path.length - 4);
    } else if (path.endsWith('.ts') || path.endsWith('.js')) {
      path = path.substring(0, path.length - 3);
    }
    c.push(`const ${getLayoutVarName(layoutName)} = () => import(${JSON.stringify(path)});`);
  });

  c.push(`const QUEST_PAGES = [`);
  for (const p of pages) {
    c.push(`  [`);

    c.push(`    ${JSON.stringify(p.id)},`);
    c.push(`    ${JSON.stringify(p.pathname)},`);
    c.push(`    ${JSON.stringify(p.title)},`);
    c.push(`    () => import(${JSON.stringify(p.filePath)}),`);
    c.push(`    ${getLayoutVarName(p.layout)}`);

    c.push(`  ],`);
  }
  c.push(`];`);

  c.push(`export const getPage = (opts) => getQuestPage(QUEST_PAGES, opts);`);

  c.push(`export const getPages = async () => [...QUEST_PAGES];`);

  c.push(`export const getNavItems = (opts) => getQuestNavItems(QUEST_PAGES, opts);`);

  const code = c.join('\n');

  return code;
}

function normalizeOptions(userOpts: PluginOptions) {
  userOpts = { ...userOpts };
  const extensions = (Array.isArray(userOpts.extensions) ? userOpts.extensions : ['.md', '.mdx'])
    .filter((ext) => typeof ext === 'string')
    .map((ext) => ext.toLowerCase().trim());
  const opts: NormalizedPluginOptions = { ...userOpts, extensions };
  return opts;
}

async function validatePlugin(opts: NormalizedPluginOptions) {
  if (typeof opts.pagesDir !== 'string') {
    return `qwest plugin "pagesDir" option missing`;
  }

  if (!isAbsolute(opts.pagesDir)) {
    return `qwest plugin "pagesDir" option must be an absolute path: ${opts.pagesDir}`;
  }

  try {
    const s = await stat(opts.pagesDir);
    if (!s.isDirectory()) {
      return `qwest plugin "pagesDir" option must be a directory: ${opts.pagesDir}`;
    }
  } catch (e) {
    return `qwest plugin "pagesDir" not found: ${e}`;
  }

  if (!opts.layouts) {
    return `qwest plugin "layouts" option missing`;
  }

  if (typeof opts.layouts.default !== 'string') {
    return `qwest plugin "layouts.default" option missing`;
  }

  if (!isAbsolute(opts.layouts.default)) {
    return `qwest plugin "layouts.default" option must be set to an absolute path: ${opts.layouts.default}`;
  }

  const layoutNames = Object.keys(opts.layouts);
  for (const layoutName of layoutNames) {
    const layoutPath = opts.layouts[layoutName];
    try {
      const s = await stat(layoutPath);
      if (!s.isFile()) {
        return `qwest plugin layout "${layoutName}" must be a file: ${layoutPath}`;
      }
    } catch (e) {
      return `qwest plugin layout "${layoutName}" not found: ${e}`;
    }
  }

  return null;
}

function isMarkdownFile(opts: NormalizedPluginOptions, filePath: string) {
  if (typeof filePath === 'string') {
    const ext = extname(filePath).toLowerCase();
    return opts.extensions.includes(ext);
  }
  return false;
}

const QWEST_ID = '@builder.io/qwest';
const RESOLVED_QWEST_ID = '\0' + QWEST_ID;

/** Known file extension we know are not directories so we can skip over them */
const IGNORE_EXT: { [key: string]: boolean } = {
  '.ts': true,
  '.tsx': true,
  '.js': true,
  '.mjs': true,
  '.cjs': true,
  '.jsx': true,
  '.css': true,
  '.html': true,
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.gif': true,
  '.ico': true,
  '.svg': true,
  '.txt': true,
  '.json': true,
  '.yml': true,
  '.yaml': true,
  '.toml': true,
  '.lock': true,
  '.log': true,
  '.bazel': true,
  '.bzl': true,
};

/** Known file and directory names we know we can skip over */
const IGNORE_NAMES: { [key: string]: boolean } = {
  build: true,
  dist: true,
  node_modules: true,
  public: true,
  target: true,
  'README.md': true,
  README: true,
  LICENSE: true,
  'LICENSE.md': true,
  Dockerfile: true,
  Makefile: true,
  WORKSPACE: true,
  '.devcontainer': true,
  '.gitignore': true,
  '.gitattributese': true,
  '.gitkeep': true,
  '.github': true,
  '.husky': true,
  '.npmrc': true,
  '.nvmrc': true,
  '.prettierignore': true,
  '.history': true,
  '.vscode': true,
  '.DS_Store': true,
};

interface ParsedPage {
  id: string;
  pathname: string;
  title: string;
  layout: string;
  filePath: string;
}

interface PageAttributes {
  title?: string;
  layout?: string;
  pathname?: string;
  id?: string;
}
