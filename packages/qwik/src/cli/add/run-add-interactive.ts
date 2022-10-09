/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import { loadIntegrations } from '../utils/integrations';
import prompts from 'prompts';
import color from 'kleur';
import { getPackageManager, panic } from '../utils/utils';
import { updateApp } from './update-app';
import type { IntegrationData, UpdateAppResult } from '../types';
import { relative } from 'path';
import { logSuccessFooter, logNextStep } from '../utils/log';

export async function runAddInteractive(app: AppCommand, id: string | undefined) {
  console.log(``);
  console.clear();
  console.log(``);

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

    const staticGenerator = integrations.find((i) => i.type === 'static-generator')!;
    const features = integrations.filter((i) => i.type === 'feature');

    const featureAnswer = await prompts(
      {
        type: 'select',
        name: 'featureType',
        message: `What feature would you like to add?`,
        choices: [
          { title: 'Server Adaptors (SSR)', value: '__server' },
          { title: 'Static Generator (SSG)', value: staticGenerator.id },
          ...features.map((f) => {
            return { title: f.name, value: f.id };
          }),
        ],
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

    if (featureAnswer.featureType === '__server') {
      // narrow list to just server integrations
      const servers = integrations.filter((i) => i.type === 'server');
      const serverAnswer = await prompts(
        {
          type: 'select',
          name: 'id',
          message: `Which server adaptor would you like to add?`,
          choices: servers.map((f) => {
            return { title: f.name, value: f.id, description: f.pkgJson.description };
          }),
          hint: ' ',
        },
        {
          onCancel: () => {
            console.log(``);
            process.exit(0);
          },
        }
      );
      integration = integrations.find((i) => i.id === serverAnswer.id);
      console.log(``);
    } else {
      integration = integrations.find((i) => i.id === featureAnswer.featureType);
    }
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
    const pkgManager = getPackageManager();
    const runInstallAnswer = await prompts(
      {
        type: 'confirm',
        name: 'runInstall',
        message: `Would you like to install ${pkgManager} dependencies?`,
        initial: true,
      },
      {
        onCancel: async () => {
          console.log('');
          process.exit(0);
        },
      }
    );
    console.log(``);
    runInstall = !!runInstallAnswer.runInstall;
  }

  const result = await updateApp({
    rootDir: app.rootDir,
    integration: integration.id,
    installDeps: runInstall,
  });

  await logUpdateAppResult(result);
}

async function logUpdateAppResult(result: UpdateAppResult) {
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

  if (overwriteFiles.length > 0) {
    console.log(`🐳 ${color.cyan(`Overwrite`)}`);
    for (const f of overwriteFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (installDeps) {
    const pkgManager = getPackageManager();
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

  if (commitAnswer.commit) {
    await result.commit(true);
    logUpdateAppCommitResult(result);
  }
}

function logUpdateAppCommitResult(result: UpdateAppResult) {
  console.clear();

  console.log(
    `🦄 ${color.bgMagenta(` Success! `)} Added ${color.bold(
      color.cyan(result.integration.id)
    )} to your app`
  );
  console.log(``);
  const isNextSteps = result.integration.pkgJson.__qwik__?.nextSteps || [];
  logNextStep(isNextSteps);
  logSuccessFooter();
}
