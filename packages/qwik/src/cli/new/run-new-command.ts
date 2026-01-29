import { green, bgMagenta, dim } from 'kleur/colors';
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
const MARKDOWN_SUFFIX = '.md';
const MDX_SUFFIX = '.mdx';

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

    const mainInput = args.slice(1).join(' ');
    let typeArg: 'route' | 'component' | 'markdown' | 'mdx' | undefined = undefined;
    let nameArg: string | undefined;
    let outDir: string | undefined;
    if (mainInput && mainInput.startsWith('/')) {
      if (mainInput.endsWith(MARKDOWN_SUFFIX)) {
        typeArg = 'markdown';
        nameArg = mainInput.replace(MARKDOWN_SUFFIX, '');
      } else if (mainInput.endsWith(MDX_SUFFIX)) {
        typeArg = 'mdx';
        nameArg = mainInput.replace(MDX_SUFFIX, '');
      } else {
        typeArg = 'route';
        nameArg = mainInput;
      }
    } else if (mainInput) {
      typeArg = 'component';
      nameArg = mainInput;
    }

    let templateArg = app.args
      .filter((a) => a.startsWith('--'))
      .map((a) => a.substring(2))
      .join('');

    if (!templateArg && mainInput) {
      templateArg = 'qwik';
    }

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

    let template: Template | undefined;
    if (!templateArg) {
      template = await selectTemplate(typeArg);
    } else {
      const allTemplates = await loadTemplates();
      const templates = allTemplates.filter(
        (i) => i.id === templateArg && i[typeArg!] && i[typeArg!].length
      );

      if (!templates.length) {
        log.error(`Template "${templateArg}" not found`);
        bye();
      }

      template = templates[0][typeArg][0];
    }

    if (typeArg === 'route' || typeArg === 'markdown' || typeArg === 'mdx') {
      outDir = join(app.rootDir, 'src', `routes`, nameArg);
    } else {
      outDir = join(app.rootDir, 'src', `components`, nameArg);
    }

    const fileOutput = await writeToFile(name, slug, template, outDir);

    log.success(`${green(`${toPascal([typeArg])} "${slug}" created!`)}`);
    log.message(`Emitted in ${dim(fileOutput)}`);
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
      { value: 'markdown', label: 'Route (Markdown)' },
      { value: 'mdx', label: 'Route (MDX)' },
    ],
  });

  if (isCancel(typeAnswer)) {
    bye();
  }

  return typeAnswer as (typeof POSSIBLE_TYPES)[number];
}

async function selectName(type: 'route' | 'component' | 'markdown' | 'mdx') {
  const messages = {
    route: 'New route path',
    markdown: 'New Markdown route path',
    mdx: 'New MDX route path',
    component: 'Name your component',
  };
  const message = messages[type];

  const placeholders = {
    route: '/product/[id]',
    markdown: '/some/page' + MARKDOWN_SUFFIX,
    mdx: '/some/page' + MDX_SUFFIX,
    component: 'my-component',
  };
  const placeholder = placeholders[type];

  const nameAnswer = await text({
    message,
    placeholder,
    validate: (v) => {
      if (v.length < 1) {
        return 'Value can not be empty';
      }
    },
  });

  if (isCancel(nameAnswer)) {
    bye();
  }
  if (typeof nameAnswer !== 'string') {
    bye();
  }

  let result = nameAnswer;

  if (type !== 'component' && !nameAnswer.startsWith('/')) {
    result = `/${result}`;
  }

  if (type === 'markdown') {
    result = result.replace(MARKDOWN_SUFFIX, '');
  } else if (type === 'mdx') {
    result = result.replace(MDX_SUFFIX, '');
  }

  return result;
}

async function selectTemplate(typeArg: (typeof POSSIBLE_TYPES)[number]) {
  const allTemplates = await loadTemplates();

  const templates = allTemplates.filter((i) => i[typeArg] && i[typeArg].length);

  if (!templates.length) {
    log.error(`No templates found for type "${typeArg}"`);
    bye();
  }
  if (templates.length === 1) {
    return templates[0][typeArg][0];
  }
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
    throw new Error(`"${filename}" already exists in "${outDir}"`);
  }

  // Get the template content
  const text = await fs.promises.readFile(template.absolute, { encoding: 'utf-8' });

  // String replace the template content
  const templateOut = inject(text, [
    [SLUG_KEY, slug],
    [NAME_KEY, name],
  ]);

  // Create recursive folders
  await fs.promises.mkdir(outDir, { recursive: true });

  // Write to file
  await fs.promises.writeFile(fileOutput, templateOut, { encoding: 'utf-8' });

  return fileOutput;
}

function inject(raw: string, vars: string[][]) {
  let output = raw;

  for (const v of vars) {
    output = output.replaceAll(v[0], v[1]);
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
  return list.join('-');
}

function toPascal(list: string[]) {
  return list.map((p) => p[0].toUpperCase() + p.substring(1)).join('');
}
