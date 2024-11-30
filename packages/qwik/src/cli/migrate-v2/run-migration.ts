import { confirm, intro, isCancel, log } from '@clack/prompts';
import type { AppCommand } from '../utils/app-command';
import { bgMagenta, bgRed, bold, green } from 'kleur/colors';
import { bye } from '../utils/utils';
import { replacePackage } from './replace-package';
import {
  installTsMorph,
  removeTsMorphFromPackageJson,
  updateDependencies,
} from './update-dependencies';

export async function runV2Migration(app: AppCommand) {
  intro(
    `✨  ${bgMagenta(' This command will migrate your Qwik application from v1 to v2')}\n` +
      `This includes the following: \n` +
      `  - "@builder.io/qwik", "@builder.io/qwik-city" and "@builder.io/qwik-react" packages will be rescoped to "@qwik.dev/core", "@qwik.dev/router" and "@qwik.dev/react" respectively \n` +
      `  - related dependencies will be updated \n\n` +
      `${bold(bgRed('Warning: migration tool is experimental and will migrate your application to the "alpha" release of Qwik V2'))}`
  );
  const proceed = await confirm({
    message: 'Do you want to proceed?',
    initialValue: true,
  });

  if (isCancel(proceed) || !proceed) {
    bye();
  }

  try {
    const installedTsMorph = await installTsMorph();
    const { replaceImportInFiles } = await import('./rename-import');
    replaceImportInFiles(
      [
        ['QwikCityProvider', 'QwikRouterProvider'],
        ['qwikCity', 'qwikRouter'],
        ['QwikCityVitePluginOptions', 'QwikRouterVitePluginOptions'],
        ['QwikCityPlugin', 'QwikRouterPlugin'],
        ['createQwikCity', 'createQwikRouter'],
        ['QwikCityNodeRequestOptions', 'QwikRouterNodeRequestOptions'],
      ],
      '@builder.io/qwik-city'
    );

    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    replacePackage('@builder.io/qwik-react', '@qwik.dev/react');
    // "@builder.io/qwik" should be the last one because it's name is a substring of the package names above
    replacePackage('@builder.io/qwik', '@qwik.dev/core');

    if (installedTsMorph) {
      await removeTsMorphFromPackageJson();
    }

    await updateDependencies();
    log.success(`${green(`Your application has been successfully migrated to v2!`)}`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}
