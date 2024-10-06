import { confirm, intro, isCancel, log } from '@clack/prompts';
import type { AppCommand } from '../utils/app-command';
import { bgMagenta, green } from 'kleur/colors';
import { bye } from '../utils/utils';
import { replacePackage } from './replace-package';
import { updateDependencies } from './update-dependencies';
import { versions } from './versions';

export async function runV2Migration(app: AppCommand) {
  intro(
    `✨  ${bgMagenta(' This command will migrate your Qwik application from v1 to v2 \n')}` +
      `This includes the following: \n` +
      //   TODO(migrate-v2): package names
      `  - "@builder.io/qwik", "@builder.io/qwik-city" packages will be rescoped to "@qwik.dev/core" and "@qwik.dev/city" \n` +
      `  - related dependencies will be updated \n`
  );
  const proceed = await confirm({
    message: 'Do you want to proceed?',
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) {
    bye();
  }

  try {
    replacePackage('@builder.io/qwik-city', '@qwik.dev/city', versions['@qwik.dev/city']);
    replacePackage('@builder.io/qwik', '@qwik.dev/qwik', versions['@qwik.dev/qwik']);
    await updateDependencies();
    log.success(`${green(`Your application has been successfully migrated to v2!`)}`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}
