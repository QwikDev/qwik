/* eslint-disable no-console */
import type { AppCommand } from './app-command';
import color from 'kleur';
import prompts from 'prompts';
import { loadIntegrations } from './integrations';
import { updateApp } from './update-app';
import { getPackageManager, panic } from './utils';
import { relative } from 'path';
import type { UpdateAppResult } from './types';
import { logUpdateAppCommitResult } from './log';

export async function runAddCommand(app: AppCommand) {
  const id = app.args[1];
  if (id === 'help') {
    await printAddHelp();
    return;
  }

  if (typeof id === 'string') {
    try {
      const result = await updateApp({
        rootDir: app.rootDir,
        integration: id,
      });
      await result.commit();
      return;
    } catch (e) {
      console.error(`\n❌ ${color.red(String(e))}\n`);
      await printAddHelp();
      process.exit(1);
    }
  }

  await runAddInteractiveCli(app);
}

async function runAddInteractiveCli(app: AppCommand) {
  console.clear();

  const integrations = await loadIntegrations();
  const features = integrations.filter((i) => i.type === 'feature');

  const featureAnswer = await prompts(
    {
      type: 'select',
      name: 'featureType',
      message: `What feature would you like to add?`,
      choices: [
        { title: 'Server (SSR)', value: '__server' },
        { title: 'Static Generator (SSG)', value: '__static-generator' },
        ...features.map((f) => {
          return { title: f.name, value: f.id };
        }),
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

  let integrationId: string;

  if (featureAnswer.featureType === '__server') {
    const servers = integrations.filter((i) => i.type === 'server');
    const serverAnswer = await prompts(
      {
        type: 'select',
        name: 'id',
        message: `Which server would you like to add?`,
        choices: servers.map((f) => {
          return { title: f.name, value: f.id, description: f.description };
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
  } else if (featureAnswer.featureType === '__static-generator') {
    const staticGenerators = integrations.filter((i) => i.type === 'static-generator');
    const staticAnswer = await prompts(
      {
        type: 'select',
        name: 'id',
        message: `Which static generator would you like to add?`,
        choices: staticGenerators.map((f) => {
          return { title: f.name, value: f.id, description: f.description };
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
    integrationId = staticAnswer.id;
    console.log(``);
  } else {
    integrationId = featureAnswer.featureType;
  }

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

  const result = await updateApp({
    rootDir: app.rootDir,
    integration: integrationId,
    installDeps: !!runInstallAnswer.runInstall,
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

  console.log(
    `🤖 ${color.bgCyan(` Ready? `)} Apply ${color.yellow(result.integration.id)} to your app?`
  );
  console.log(``);

  if (modifyFiles.length > 0) {
    console.log(`🚙 ${color.cyan(`Modify`)}`);
    for (const f of modifyFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (overwriteFiles.length > 0) {
    console.log(`🚗 ${color.cyan(`Overwrite`)}`);
    for (const f of overwriteFiles) {
      console.log(`   - ${relative(process.cwd(), f.path)}`);
    }
    console.log(``);
  }

  if (installDeps) {
    const pkgManager = getPackageManager();
    console.log(
      `🏎 ${color.cyan(
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
      message: `Ready to apply the ${color.yellow(result.integration.id)} updates to your app?`,
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

export async function printAddHelp() {
  const integrations = await loadIntegrations();
  const servers = integrations.filter((i) => i.type === 'server');
  const staticGenerators = integrations.filter((i) => i.type === 'static-generator');
  const features = integrations.filter((i) => i.type === 'feature');

  console.log(`${color.green(`qwik add`)} ${color.cyan(`[feature]`)}`);
  console.log(``);

  console.log(`  ${color.cyan('Servers')}`);
  for (const s of servers) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Static Generators')}`);
  for (const s of staticGenerators) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Features')}`);
  for (const s of features) {
    console.log(`    ${s.id}  ${color.dim(s.description)}`);
  }
  console.log(``);
}
