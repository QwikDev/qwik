import fs from 'node:fs';
import { join, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TemplateSet } from '../types';
import { getFilesDeep } from './utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

let templates: TemplateSet[] | null = null;

export async function loadTemplates() {
  if (!templates) {
    const allTemplates: TemplateSet[] = [];

    const templatesDir = join(__dirname, 'templates');
    const templatesDirNames = await fs.promises.readdir(templatesDir);

    await Promise.all(
      templatesDirNames.map(async (templatesDirName) => {
        const dir = join(templatesDir, templatesDirName);
        const files = await readTemplates(dir);
        const template = { id: templatesDirName, ...files };
        allTemplates.push(template);
      })
    );

    // Sort qwik templates first so they can be overridden, then alphabetical
    allTemplates.sort((a, b) => {
      if (a.id === 'qwik') {
        return -1;
      } else if (b.id === 'qwik') {
        return 1;
      }

      return a.id > b.id ? 1 : -1;
    });

    templates = allTemplates;
  }

  return templates;
}

export async function readTemplates(rootDir: string) {
  const componentDir = join(rootDir, 'component');
  const routeDir = join(rootDir, 'route');
  const markdownDir = join(rootDir, 'markdown');
  const mdxDir = join(rootDir, 'mdx');

  const component = await getFilesDeep(componentDir);
  const route = await getFilesDeep(routeDir);
  const markdown = await getFilesDeep(markdownDir);
  const mdx = await getFilesDeep(mdxDir);

  return {
    component: component.map((c) => parseTemplatePath(c, 'component')),
    route: route.map((r) => parseTemplatePath(r, 'route')),
    markdown: markdown.map((m) => parseTemplatePath(m, 'markdown')),
    mdx: mdx.map((m) => parseTemplatePath(m, 'mdx')),
  };
}

function parseTemplatePath(path: string, type: string) {
  const parts = path.split(sep + type + sep);

  return {
    absolute: path,
    relative: parts[1],
  };
}
