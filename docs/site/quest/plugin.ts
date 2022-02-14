import { readdir, stat, readFile } from 'fs/promises';
import { isAbsolute, join, extname, basename, dirname } from 'path';
import frontmatter from 'front-matter';
import type { QuestPluginOptions, NormalizedPluginOptions } from './types';
import type { Plugin, ViteDevServer } from 'vite';
import slugify from 'slugify';
import { ModuleNode } from 'vite';
import { ModuleGraph } from 'vite';

export function quest(options: QuestPluginOptions) {
  const opts = normalizeOptions(options);
  let questCode: string | null = null;
  let server: ViteDevServer | undefined;

  const plugin: Plugin = {
    name: 'quest-plugin',

    configureServer(viteServer) {
      server = viteServer;
    },

    handleHotUpdate(ctx) {
      const changedFile = ctx.file;
      if (server && typeof changedFile === 'string') {
        const moduleGraph = server.moduleGraph;
        const questMod = moduleGraph.getModuleById(RESOLVED_QUEST_ID);
        if (isMarkdownFile(opts, changedFile) || isQuestModuleDependency(questMod, changedFile)) {
          invalidateQuestModule(moduleGraph, questMod);
        }
      }
    },

    buildStart() {
      questCode = null;
    },

    resolveId(id) {
      if (QUEST_ID === id) {
        return RESOLVED_QUEST_ID;
      }
      return null;
    },

    async load(id) {
      if (id === RESOLVED_QUEST_ID) {
        if (questCode == null) {
          if (typeof opts.pagesDir !== 'string' || !isAbsolute(opts.pagesDir)) {
            console.error('quest plugin "pagesDir" options must be an absolute path');
            return null;
          }
          if (
            !opts.layouts ||
            typeof opts.layouts.default !== 'string' ||
            !isAbsolute(opts.layouts.default)
          ) {
            console.error('quest plugin "layouts.default" option must be set to an absolute path');
            return null;
          }

          const pages = await getPages(opts, opts.pagesDir, []);
          const pagesSet = new Set(pages.map((p) => p.filePath));
          pages.forEach((p) => {
            this.addWatchFile(p.filePath);
          });
          questCode = loadQuest(opts, pages);

          if (server) {
            const mod = server.moduleGraph.getModuleById(id);
            server.moduleGraph.updateModuleInfo(mod!, pagesSet, pagesSet, true);
          }
        }
        return questCode;
      }
      return null;
    },
  };

  return plugin as any;
}

function invalidateQuestModule(moduleGraph: ModuleGraph, questMod: ModuleNode | undefined) {
  const checkedFiles = new Set<string>();
  const invalidate = (mod: ModuleNode | undefined) => {
    if (mod && mod.file && !checkedFiles.has(mod.file)) {
      checkedFiles.add(mod.file);
      moduleGraph.invalidateModule(mod);
      mod.importedModules.forEach(invalidate);
    }
  };
  invalidate(questMod);
}

function isQuestModuleDependency(questMod: ModuleNode | undefined, changedFile: string) {
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
  checkDep(questMod);
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

function loadQuest(opts: NormalizedPluginOptions, pages: ParsedPage[]) {
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

function normalizeOptions(userOpts: QuestPluginOptions) {
  userOpts = { ...userOpts };
  const extensions = (Array.isArray(userOpts.extensions) ? userOpts.extensions : ['.md', '.mdx'])
    .filter((ext) => typeof ext === 'string')
    .map((ext) => ext.toLowerCase().trim());
  const opts: NormalizedPluginOptions = { ...userOpts, extensions };
  return opts;
}

function isMarkdownFile(opts: NormalizedPluginOptions, filePath: string) {
  if (typeof filePath === 'string') {
    const ext = extname(filePath).toLowerCase();
    return opts.extensions.includes(ext);
  }
  return false;
}

const QUEST_ID = '@quest';
const RESOLVED_QUEST_ID = '\0' + QUEST_ID;

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
