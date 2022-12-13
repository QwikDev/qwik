/* eslint-disable no-console */
import color from 'kleur';
import fs from 'node:fs';
import { join } from 'path';
import prompts from 'prompts';
import type { AppCommand } from '../utils/app-command';
import { loadTemplates } from '../utils/templates';
import { readPackageJson } from '../utils/utils';
import { printEnableHelp } from './print-enable-help';

export async function runEnableCommand(app: AppCommand) {
  try {
    const type = app.args[1];

    if (type === 'templates') {
      return runEnableTemplates(app);
    }

    throw new Error(`Unknown type of ${type}`);
  } catch (e) {
    console.error(`\n❌ ${color.red(String(e))}\n`);
    await printEnableHelp();
    process.exit(1);
  }
}

export async function runEnableTemplates(app: AppCommand) {
  console.log(``);
  console.clear();
  console.log(``);

  // use interactive cli to choose which templates to enable
  console.log(`🦋 ${color.bgCyan(` Enable templates `)}`);
  console.log(``);

  const templates = await loadTemplates();

  const packageJson = await readPackageJson(app.rootDir);
  const enabledTemplates = packageJson.qwikTemplates;

  const templateChoices = templates
    .filter((i) => i.id !== 'qwik')
    .map((f) => {
      return { title: f.id, value: f.id, selected: enabledTemplates?.includes(f.id) };
    });

  const templateAnswer = await prompts(
    {
      type: 'multiselect',
      name: 'values',
      message: `What templates would you like to enable?`,
      choices: templateChoices,
      hint: '(use ↓↑ arrows, space to select, hit enter to submit)',
    },
    {
      onCancel: () => {
        console.log(``);
        process.exit(0);
      },
    }
  );
  console.log(``);

  const packageJsonPath = join(app.rootDir, 'package.json');
  packageJson.qwikTemplates = templateAnswer.values;

  await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2), {
    encoding: 'utf-8',
  });

  return templateAnswer.values as string[];
}
