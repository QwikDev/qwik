/* eslint-disable no-console */
import { magenta, cyan, dim } from 'kleur/colors';
import { loadIntegrations } from '../utils/integrations';
import { pmRunCmd, note, bye } from '../utils/utils';
import { confirm, intro, isCancel } from '@clack/prompts';
import type { IntegrationData } from '../types';
import type { AppCommand } from '../utils/app-command';

const SPACE_TO_HINT = 25;

function renderIntegration(integrations: IntegrationData[]) {
  return integrations
    .map(
      (integration) =>
        integration.id +
        ' '.repeat(SPACE_TO_HINT - integration.id.length) +
        dim(integration.pkgJson.description)
    )
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

  // const command =
}
