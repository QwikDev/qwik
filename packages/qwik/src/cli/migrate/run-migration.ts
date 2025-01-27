import { confirm, intro, isCancel, log } from '@clack/prompts';
import { bgMagenta, green } from 'kleur/colors';
import { bye } from '../utils/utils';
// TODO: this util should be moved
import { installTsMorph } from '../migrate-v2/update-dependencies';
import type { AppCommand } from '../utils/app-command';

export async function runMigrations(app: AppCommand) {
  intro(`✨  ${bgMagenta(' This command will migrate your Qwik application')}\n`);

  const proceed = await confirm({
    message: 'Do you want to proceed?',
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) {
    bye();
  }

  try {
    await installTsMorph();

    log.success(`${green(`Your application has been successfully migrated!`)}`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}
