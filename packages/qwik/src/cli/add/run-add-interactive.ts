/* eslint-disable no-console */
import type { AppCommand } from '../utils/app-command';
import { loadIntegrations } from '../utils/integrations';
import prompts from 'prompts';
import color from 'kleur';
import { getPackageManager, panic } from '../utils/utils';
import { updateApp } from './update-app';
import type { UpdateAppResult } from '../types';
import { relative } from 'path';
import { logSuccessFooter } from '../utils/log';

export async function runAddInteractive(app: AppCommand) {
  console.log(``);
  console.clear();
  console.log(``);

  const integrations = await loadIntegrations();
  const staticGenerator = integrations.find((i) => i.type === 'static-generator')!;
  const features = integrations.filter((i) => i.type === 'feature');

  const featureAnswer = await prompts(
    {
      type: 'select',
      name: 'featureType',
      message: `What feature would you like to add?`,
      choices: [
        { title: 'Server (SSR)', value: '__server' },
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

  let integrationId: string;

  if (featureAnswer.featureType === '__server') {
    const servers = integrations.filter((i) => i.type === 'server');
    const serverAnswer = await prompts(
      {
        type: 'select',
        name: 'id',
        message: `Which server would you like to add?`,
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
    integrationId = serverAnswer.id;
    console.log(``);
  } else {
    integrationId = featureAnswer.featureType;
  }

  const selectedIntegration = integrations.find((i) => i.id === integrationId);

  const integrationHasDeps =
    Object.keys({
      ...selectedIntegration?.pkgJson.dependencies,
      ...selectedIntegration?.pkgJson.devDependencies,
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
    integration: integrationId,
    installDeps: runInstall,
  });

  await logUpdateAppResult(result);
}

export async function logUpdateAppResult(result: UpdateAppResult) {
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
    `🦄 ${color.bgCyan(` Ready? `)} Apply ${color.bold(
      color.magenta(result.integration.id)
    )} to your app?`
  );
  console.log(``);

  if (modifyFiles.length > 0) {
    console.log(`👻 ${color.cyan(`Modify`)}`);
    for (const f of modifyFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (overwriteFiles.length > 0) {
    console.log(`🌐 ${color.cyan(`Overwrite`)}`);
    for (const f of overwriteFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (installDeps) {
    const pkgManager = getPackageManager();
    console.log(
      `💿 ${color.cyan(
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

  logSuccessFooter();
}
