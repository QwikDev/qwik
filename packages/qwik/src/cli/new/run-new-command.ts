/* eslint-disable no-console */
import color from 'kleur';
import fs from 'node:fs';
import { join } from 'path';
import prompts from 'prompts';
import { intro, isCancel, select, text, log, spinner, outro } from '@clack/prompts';
import { bye, note } from '../utils/utils';
import type { Template } from '../types';
import type { AppCommand } from '../utils/app-command';
import { loadTemplates } from '../utils/templates';
import { printNewHelp } from './print-new-help';

const POSSIBLE_TYPES = ['component', 'route'] as const;
const SLUG_KEY = '[slug]';
const NAME_KEY = '[name]';

export async function runNewCommand(app: AppCommand) {
  try {
    const args = app.args.filter((a) => !a.startsWith('--'));
    const templates = app.args.filter((a) => a.startsWith('--')).map((t) => t.replace('--', ''));

    let typeArg = args[1] as (typeof POSSIBLE_TYPES)[number];
    let nameArg = args.slice(2).join(' ');

    if (!typeArg) {
      typeArg = await selectType();
    }

    if (!POSSIBLE_TYPES.includes(typeArg)) {
      throw new Error(`Invalid type: ${typeArg}`);
    }

    if (!nameArg) {
      nameArg = await selectName(typeArg);
    }

    const { name, slug } = parseInputName(nameArg);

    const allTemplates = await loadTemplates();

    const templateSets = allTemplates
      .filter((i) => templates.includes(i.id) || i.id === 'qwik')
      .filter((i) => i[typeArg] && i[typeArg].length);

    const writers: Promise<void>[] = [];

    for (const templateSet of templateSets) {
      for (const template of templateSet[typeArg]) {
        const outDir = join(app.rootDir, 'src', `${typeArg}s`);
        writers.push(writeToFile(name, slug, template as unknown as Template, outDir));
      }
    }

    await Promise.all(writers);

    console.log(``);
    console.log(`${color.green(`${toPascal([typeArg])} ${name} created!`)}`);
    console.log(``);
  } catch (e) {
    log.error(String(e));
    await printNewHelp();
    process.exit(1);
  }
}

async function selectType() {
  const typeAnswer = await select({
    message: 'What would you like to create?',
    options: [
      { value: 'component', label: 'Component' },
      { value: 'route', label: 'Route' },
    ],
  });

  if (isCancel(typeAnswer)) {
    bye();
  }

  return typeAnswer as (typeof POSSIBLE_TYPES)[number];
}

async function selectName(type: string) {
  const nameAnswer = await text({
    message: `Name your ${type}`,
  });

  if (isCancel(nameAnswer)) {
    bye();
  }

  return nameAnswer as string;
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

function parseInputName(input: string) {
  const parts = input.split(/[-_\s]/g);

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

function escapeRegExp(val: string) {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAll(val: string, find: string, replace: string) {
  return val.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}
