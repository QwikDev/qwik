/* eslint-disable no-console */
import color from 'kleur';
import fs from 'node:fs';
import { join } from 'path';
import { runEnableTemplates } from '../enable/run-enable-command';
import type { Template, TemplateSet } from '../types';
import type { AppCommand } from '../utils/app-command';
import { loadTemplates } from '../utils/templates';
import { readPackageJson } from '../utils/utils';
import { printNewHelp } from './print-new-help';

const TYPES = [
  ['component', 'c'],
  ['route', 'r'],
];

const SLUG_KEY = '[slug]';
const NAME_KEY = '[name]';

export async function runNewCommand(app: AppCommand) {
  try {
    const type = getType(app.args[1]) as keyof TemplateSet;
    const id = app.args.slice(2);

    if (!type || !id.length) {
      throw new Error(`Invalid type: ${type}`);
    }

    if (!id) {
      throw new Error(`Missing ${type} name`);
    }

    const { name, slug } = parseInputName(id);

    const packageJson = await readPackageJson(app.rootDir);
    let enabledTemplates = packageJson.qwikTemplates;

    if (!enabledTemplates) {
      enabledTemplates = await runEnableTemplates(app);
    }

    const allTemplates = await loadTemplates();

    const templateSets = allTemplates
      .filter((i) => enabledTemplates!.includes(i.id) || i.id === 'qwik')
      .filter((i) => i[type] && i[type].length);

    const writers: Promise<void>[] = [];

    for (const templateSet of templateSets) {
      for (const template of templateSet[type]) {
        const outDir = join(app.rootDir, 'src', `${type}s`);
        writers.push(writeToFile(name, slug, template as unknown as Template, outDir));
      }
    }

    await Promise.all(writers);
  } catch (e) {
    console.error(`\n❌ ${color.red(String(e))}\n`);
    await printNewHelp();
    process.exit(1);
  }
}

async function writeToFile(name: string, slug: string, template: Template, outDir: string) {
  const relativeDirMatches = template.relative.match(/.+?(?=(\/[^/]+$))/);
  const relativeDir = relativeDirMatches ? relativeDirMatches[0] : undefined;
  const fileDir = inject(join(outDir, relativeDir ?? ''), [[SLUG_KEY, slug]]);

  // Exit if the module already exists
  if (fs.existsSync(fileDir)) {
    throw new Error(`${slug} already exists in ${fileDir}`);
  }

  // Get the template content
  const text = await fs.promises.readFile(template.absolute, { encoding: 'utf-8' });

  // String replace the template content
  const templateOut = inject(text, [
    [SLUG_KEY, slug],
    [NAME_KEY, name],
  ]);

  // Build the full output file path + name
  const outFile = join(outDir, template.relative);

  // String replace the file path
  const fileOutput = inject(outFile, [
    [SLUG_KEY, slug],
    ['.template', ''],
  ]);

  // Create recursive folders
  await fs.promises.mkdir(fileDir, { recursive: true });

  // Write to file
  await fs.promises.writeFile(fileOutput, templateOut, { encoding: 'utf-8' });
}

function inject(raw: string, vars: string[][]) {
  let output = raw;

  for (const v of vars) {
    output = replaceAll(output, v[0], v[1]);
  }

  return output;
}

function parseInputName(id: string[]) {
  const parts = id.map((i) => i.split(/[-_\s]/g)).flat();

  return {
    slug: toSlug(parts),
    name: toPascal(parts),
  };
}

function toSlug(list: string[]) {
  return list.join('-').toLowerCase();
}

function toPascal(list: string[]) {
  return list.map((p) => p[0].toUpperCase() + p.substring(1).toLowerCase()).join('');
}

function getType(input: string) {
  const group = TYPES.find((t) => t.includes(input));
  return group ? group[0] : null;
}

function escapeRegExp(val: string) {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAll(val: string, find: string, replace: string) {
  return val.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}
