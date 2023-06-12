import { green, bgMagenta } from 'kleur/colors';
import fs from 'node:fs';
import { join } from 'path';
import { isCancel, select, text, log, intro } from '@clack/prompts';
import { bye } from '../utils/utils';
import type { Template } from '../types';
import type { AppCommand } from '../utils/app-command';
import { loadTemplates } from '../utils/templates';
import { printNewHelp } from './print-new-help';
import { POSSIBLE_TYPES } from './utils';

const SLUG_KEY = '[slug]';
const NAME_KEY = '[name]';

export async function runNewCommand(app: AppCommand) {
  try {
    // render help
    if (app.args.length > 1 && app.args[1] === 'help') {
      intro(`🔭  ${bgMagenta(' Qwik Help ')}`);
      await printNewHelp();
      bye();
    } else {
      intro(`✨  ${bgMagenta(' Create a new Qwik component or route ')}`);
    }

    const args = app.args.filter((a) => !a.startsWith('--'));

    let typeArg = args[1] as (typeof POSSIBLE_TYPES)[number];
    let nameArg = args.slice(2).join(' ');
    const templateArg = app.args
      .filter((a) => a.startsWith('--'))
      .map((a) => a.substring(2))
      .join('');

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

    const writers: Promise<void>[] = [];

    let template: Template | undefined;
    if (!templateArg) {
      template = await selectTemplate(typeArg);
    } else {
      const allTemplates = await loadTemplates();
      const templates = allTemplates.filter(
        (i) => i.id === templateArg && i[typeArg] && i[typeArg].length
      );

      if (!templates.length) {
        log.error(`Template "${templateArg}" not found`);
        bye();
      }

      template = templates[0][typeArg][0];
    }

    const outDir = join(app.rootDir, 'src', `${typeArg}s`);
    writers.push(writeToFile(name, slug, template as unknown as Template, outDir));

    await Promise.all(writers);

    log.success(`${green(`${toPascal([typeArg])} "${name}" created!`)}`);
  } catch (e) {
    log.error(String(e));
    await printNewHelp();
  }
  bye();
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

async function selectTemplate(typeArg: (typeof POSSIBLE_TYPES)[number]) {
  const allTemplates = await loadTemplates();

  const templates = allTemplates.filter((i) => i[typeArg] && i[typeArg].length);

  const templateAnswer = await select({
    message: 'Which template would you like to use?',
    options: templates.map((t) => ({ value: t[typeArg][0], label: t.id })),
  });

  if (isCancel(templateAnswer)) {
    bye();
  }

  return templateAnswer as Template;
}

async function writeToFile(name: string, slug: string, template: Template, outDir: string) {
  const relativeDirMatches = template.relative.match(/.+?(?=(\/[^/]+$))/);
  const relativeDir = relativeDirMatches ? relativeDirMatches[0] : undefined;
  const fileDir = inject(join(outDir, relativeDir ?? ''), [[SLUG_KEY, slug]]);

  // Build the full output file path + name
  const outFile = join(outDir, template.relative);

  // String replace the file path
  const fileOutput = inject(outFile, [
    [SLUG_KEY, slug],
    ['.template', ''],
  ]);

  // Exit if the module already exists
  if (fs.existsSync(fileOutput)) {
    const filename = fileOutput.split('/').pop();
    throw new Error(`"${filename}" already exists in "${fileDir}"`);
  }

  // Get the template content
  const text = await fs.promises.readFile(template.absolute, { encoding: 'utf-8' });

  // String replace the template content
  const templateOut = inject(text, [
    [SLUG_KEY, slug],
    [NAME_KEY, name],
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
