/* eslint-disable no-console */
import { confirm, intro, isCancel, select } from '@clack/prompts';
import { dim, magenta } from 'kleur/colors';
import type { IntegrationData } from '../types';
import type { AppCommand } from '../utils/app-command';
import { loadIntegrations, sortIntegrationsAndReturnAsClackOptions } from '../utils/integrations';
import { bye, limitLength, note, pmRunCmd } from '../utils/utils';
import { runAddInteractive } from './run-add-interactive';

const SPACE_TO_HINT = 25;
const MAX_HINT_LENGTH = 50;

function renderIntegration(integrations: IntegrationData[]) {
  return integrations
    .map((integration) => {
      const hint = limitLength(integration.pkgJson.description, MAX_HINT_LENGTH);
      return (
        integration.id + ' '.repeat(Math.max(SPACE_TO_HINT - integration.id.length, 2)) + dim(hint)
      );
    })
    .join('\n');
}

export async function printAddHelp(app: AppCommand) {
  const integrations = await loadIntegrations();
  const adapters = integrations.filter((i) => i.type === 'adapter');
  const features = integrations.filter((i) => i.type === 'feature');
  const pmRun = pmRunCmd();

  intro(`${pmRun} qwik ${magenta(`add`)} [integration]`);

  note(renderIntegration(adapters), 'Adapters');
  note(renderIntegration(features), 'Features');

  const proceed = await confirm({
    message: 'Do you want to install an integration?',
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) {
    bye();
  }

  const command = await select({
    message: 'Select an integration',
    options: await sortIntegrationsAndReturnAsClackOptions(integrations),
  });

  if (isCancel(command)) {
    bye();
  }

  runAddInteractive(app, command as string);
}
