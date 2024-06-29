import { confirm, intro, isCancel } from '@clack/prompts';
import type { AppCommand } from '../utils/app-command';
import { bgMagenta } from 'kleur/colors';
import { bye } from '../utils/utils';
import { replacePackage } from './replace-package';

export async function runV2Migration(app: AppCommand) {
  intro(
    `✨  ${bgMagenta(' This command will migrate your Qwik application from v1 to v2 \n')}` +
      `This includes the following: \n` +
    //   TODO: package names
      `  - "@builder.io/qwik", "@builder.io/qwik-city" packages will be rescoped to "@qwik.dev/core" and "@qwik.dev/qwik-city" \n` +
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
      replacePackage('@builder.io/qwik', '@qwik.dev/qwik');
      replacePackage('@builder.io/qwik-city', '@qwik.dev/city');
  } catch (error) {
    console.log(error);
    throw error
  }

}
