import { intro, isCancel, log, outro, select, spinner } from '@clack/prompts';
import { bgBlue, bgMagenta, blue, bold, cyan, magenta } from 'kleur/colors';
import type { IntegrationData, UpdateAppOptions, UpdateAppResult } from '../types';
import { loadIntegrations, sortIntegrationsAndReturnAsClackOptions } from '../utils/integrations';
import { bye, getPackageManager, note, panic } from '../utils/utils';

import { relative } from 'node:path';
import type { AppCommand } from '../utils/app-command';
import { runInPkg } from '../utils/install-deps';
import { logNextStep } from '../utils/log';
import { updateApp } from './update-app';

export async function runAddInteractive(app: AppCommand, id: string | undefined) {
  const pkgManager = getPackageManager();
  const integrations = await loadIntegrations();
  let integration: IntegrationData | undefined;

  if (typeof id === 'string') {
    // cli passed a flag with the integration id to add
    integration = integrations.find((i) => i.id === id);
    if (!integration) {
      throw new Error(`Invalid integration: ${id}`);
    }

    intro(`🦋 ${bgBlue(` Add Integration `)} ${bold(magenta(integration.id))}`);
  } else {
    // use interactive cli to choose which integration to add
    intro(`🦋 ${bgBlue(` Add Integration `)}`);

    const integrationChoices = [
      ...integrations.filter((i) => i.type === 'adapter'),
      ...integrations.filter((i) => i.type === 'feature'),
    ];

    const integrationAnswer = await select({
      message: 'What integration would you like to add?',
      options: await sortIntegrationsAndReturnAsClackOptions(integrationChoices),
    });

    if (isCancel(integrationAnswer)) {
      bye();
    }

    integration = integrations.find((i) => i.id === integrationAnswer);

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

  const updateAppOptions: UpdateAppOptions = {
    rootDir: app.rootDir,
    integration: integration.id,
    installDeps: runInstall,
  };
  const projectDir = app.getArg('projectDir');
  if (projectDir) {
    updateAppOptions.projectDir = projectDir;
  }

  const result = await updateApp(pkgManager, updateAppOptions);

  if (app.getArg('skipConfirmation') !== 'true') {
    await logUpdateAppResult(pkgManager, result);
  }
  await result.commit(true);
  const postInstall = result.integration.pkgJson.__qwik__?.postInstall;
  if (postInstall) {
    const s = spinner();
    s.start(`Running post install script: ${postInstall}`);
    await runInPkg(pkgManager, postInstall.split(' '), app.rootDir);
    s.stop('Post install script complete');
  }
  logUpdateAppCommitResult(result, pkgManager);

  // close the process
  process.exit(0);
}

async function logUpdateAppResult(pkgManager: string, result: UpdateAppResult) {
  const modifyFiles = result.updates.files.filter((f) => f.type === 'modify');
  const overwriteFiles = result.updates.files.filter((f) => f.type === 'overwrite');
  const createFiles = result.updates.files.filter((f) => f.type === 'create');
  const installDepNames = Object.keys(result.updates.installedDeps);
  const installScripts = result.updates.installedScripts;

  const installDeps = installDepNames.length > 0;

  if (
    modifyFiles.length === 0 &&
    overwriteFiles.length === 0 &&
    createFiles.length === 0 &&
    installScripts.length === 0 &&
    !installDeps
  ) {
    panic(`No updates made`);
  }

  log.step(`👻 ${bgBlue(` Ready? `)} Add ${bold(magenta(result.integration.id))} to your app?`);

  if (modifyFiles.length > 0) {
    log.message(
      [
        `🐬 ${cyan('Modify')}`,
        ...modifyFiles.map((f) => `   - ${relative(process.cwd(), f.path)}`),
      ].join('\n')
    );
  }

  if (createFiles.length > 0) {
    log.message(
      [
        `🌟 ${cyan(`Create`)}`,
        ...createFiles.map((f) => `   - ${relative(process.cwd(), f.path)}`),
      ].join('\n')
    );
  }

  if (overwriteFiles.length > 0) {
    log.message(
      [
        `🐳 ${cyan(`Overwrite`)}`,
        ...overwriteFiles.map((f) => `   - ${relative(process.cwd(), f.path)}`),
      ].join('\n')
    );
  }

  if (installDepNames.length > 0) {
    log.message(
      [
        `💾 ${cyan(`Install ${pkgManager} dependenc${installDepNames.length > 1 ? 'ies' : 'y'}:`)}`,
        ...installDepNames.map(
          (depName) => `   - ${depName} ${result.updates.installedDeps[depName]}`
        ),
      ].join('\n')
    );
  }

  if (installScripts.length > 0) {
    const prefix = pkgManager === 'npm' ? 'npm run' : pkgManager;
    log.message(
      [
        `📜 ${cyan(`New ${pkgManager} script${installDepNames.length > 1 ? 's' : ''}:`)}`,
        ...installScripts.map((script) => `   - ${prefix} ${script}`),
      ].join('\n')
    );
  }

  const commit = await select({
    message: `Ready to apply the ${bold(magenta(result.integration.id))} updates to your app?`,
    options: [
      { label: 'Yes looks good, finish update!', value: true },
      { label: 'Nope, cancel update', value: false },
    ],
  });

  if (isCancel(commit) || !commit) {
    bye();
  }
}

function logUpdateAppCommitResult(result: UpdateAppResult, pkgManager: string) {
  if (result.updates.installedScripts.length > 0) {
    const prefix = pkgManager === 'npm' || pkgManager === 'bun' ? `${pkgManager} run` : pkgManager;
    const message = result.updates.installedScripts
      .map((script) => `- ${prefix} ${blue(script)}`)
      .join('\n');
    note(message, 'New scripts added');
  }

  const nextSteps = result.integration.pkgJson.__qwik__?.nextSteps;
  if (nextSteps) {
    const noteMessage = `🟣 ${bgMagenta(` ${nextSteps.title ?? 'Action Required!'} `)}`;
    note(logNextStep(nextSteps, pkgManager), noteMessage);
  }

  outro(`🦄 ${bgMagenta(` Success! `)} Added ${bold(cyan(result.integration.id))} to your app`);

  // TODO: `logSuccessFooter` returns a string, but we don't use it!
  // logSuccessFooter(result.integration.docs);
}
