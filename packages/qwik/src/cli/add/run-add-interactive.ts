/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import { loadIntegrations } from '../utils/integrations';
import prompts from 'prompts';
import color from 'kleur';
import { getPackageManager, panic } from '../utils/utils';
import { updateApp } from './update-app';
import type { IntegrationData, UpdateAppResult } from '../types';
import { relative } from 'node:path';
import { logSuccessFooter, logNextStep } from '../utils/log';
import { runInPkg, startSpinner } from '../utils/install-deps';

export async function runAddInteractive(app: AppCommand, id: string | undefined) {
  console.log(``);
  console.clear();
  console.log(``);

  const pkgManager = getPackageManager();
  const integrations = await loadIntegrations();
  let integration: IntegrationData | undefined;

  if (typeof id === 'string') {
    // cli passed a flag with the integration id to add
    integration = integrations.find((i) => i.id === id);
    if (!integration) {
      throw new Error(`Invalid integration: ${id}`);
    }

    console.log(
      `🦋 ${color.bgCyan(` Add Integration `)} ${color.bold(color.magenta(integration.id))}`
    );
    console.log(``);
  } else {
    // use interactive cli to choose which integration to add
    console.log(`🦋 ${color.bgCyan(` Add Integration `)}`);
    console.log(``);

    const integrationChoices = [
      ...integrations.filter((i) => i.type === 'adaptor'),
      ...integrations.filter((i) => i.type === 'feature'),
    ].map((f) => {
      return { title: f.name, value: f.id };
    });

    const integrationAnswer = await prompts(
      {
        type: 'select',
        name: 'featureType',
        message: `What integration would you like to add?`,
        choices: integrationChoices,
        hint: '(use ↓↑ arrows, hit enter)',
      },
      {
        onCancel: () => {
          console.log(``);
          process.exit(0);
        },
      }
    );
    console.log(``);

    integration = integrations.find((i) => i.id === integrationAnswer.featureType);

    if (!integration) {
      throw new Error(`Invalid integration: ${id}`);
    }
  }

  const integrationHasDeps =
    Object.keys({
      ...integration.pkgJson.dependencies,
      ...integration.pkgJson.devDependencies,
    }).length > 0;

  let runInstall = false;
  if (integrationHasDeps) {
    runInstall = true;
  }

  const result = await updateApp(pkgManager, {
    rootDir: app.rootDir,
    integration: integration.id,
    installDeps: runInstall,
  });

  const commit = await logUpdateAppResult(pkgManager, result);
  if (commit) {
    await result.commit(true);
    const postInstall = result.integration.pkgJson.__qwik__?.postInstall;
    if (postInstall) {
      const spinner = startSpinner(`Running post install script: ${postInstall}`);
      await runInPkg(pkgManager, postInstall.split(' '), app.rootDir);
      spinner.succeed();
    }
    logUpdateAppCommitResult(result);
  }
}

async function logUpdateAppResult(pkgManager: string, result: UpdateAppResult) {
  const modifyFiles = result.updates.files.filter((f) => f.type === 'modify');
  const overwriteFiles = result.updates.files.filter((f) => f.type === 'overwrite');
  const createFiles = result.updates.files.filter((f) => f.type === 'create');
  const installDepNames = Object.keys(result.updates.installedDeps);
  const installDeps = installDepNames.length > 0;

  if (
    modifyFiles.length === 0 &&
    overwriteFiles.length === 0 &&
    createFiles.length === 0 &&
    !installDeps
  ) {
    panic(`No updates made`);
  }

  console.log(``);
  console.clear();
  console.log(``);

  console.log(
    `👻 ${color.bgCyan(` Ready? `)} Add ${color.bold(
      color.magenta(result.integration.id)
    )} to your app?`
  );
  console.log(``);

  if (modifyFiles.length > 0) {
    console.log(`🐬 ${color.cyan(`Modify`)}`);
    for (const f of modifyFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (createFiles.length > 0) {
    console.log(`🌟 ${color.cyan(`Create`)}`);
    for (const f of createFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (overwriteFiles.length > 0) {
    console.log(`🐳 ${color.cyan(`Overwrite`)}`);
    for (const f of overwriteFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (installDeps) {
    console.log(
      `💾 ${color.cyan(
        `Install ${pkgManager} dependenc${installDepNames.length > 1 ? 'ies' : 'y'}:`
      )}`
    );
    installDepNames.forEach((depName) => {
      console.log(`   - ${depName} ${result.updates.installedDeps[depName]}`);
    });
    console.log(``);
  }

  const commitAnswer = await prompts(
    {
      type: 'select',
      name: 'commit',
      message: `Ready to apply the ${color.bold(
        color.magenta(result.integration.id)
      )} updates to your app?`,
      choices: [
        { title: 'Yes looks good, finish update!', value: true },
        { title: 'Nope, cancel update', value: false },
      ],
      hint: ' ',
    },
    {
      onCancel: () => {
        console.log(``);
        process.exit(0);
      },
    }
  );
  console.log(``);

  return commitAnswer.commit as boolean;
}

function logUpdateAppCommitResult(result: UpdateAppResult) {
  console.log(
    `🦄 ${color.bgMagenta(` Success! `)} Added ${color.bold(
      color.cyan(result.integration.id)
    )} to your app`
  );
  console.log(``);
  logSuccessFooter(result.integration.docs);
  const nextSteps = result.integration.pkgJson.__qwik__?.nextSteps;
  logNextStep(nextSteps);
}
