import { confirm, intro, isCancel, log } from '@clack/prompts';
import type { AppCommand } from '../utils/app-command';
import { bgMagenta, bgRed, bold, green } from 'kleur/colors';
import { bye } from '../utils/utils';
import { removePackage, replacePackage } from './replace-package';
import { takeWarnings, V2_BEHAVIOR_CHANGES, warnMentions } from './report';
import { updateConfigurations } from './update-configurations';
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
      `  - renamed and removed APIs will be updated in your code \n` +
      `  - options will be added to keep the v1 behavior where v2 changed it (e.g. \`strictLoaders: false\`) \n` +
      `  - "tsconfig.json", "package.json" and the related dependencies (e.g. Vite 8) will be updated \n` +
      `  - changes that need your attention will be listed at the end \n\n` +
      `${bold(bgRed('Warning: migration tool is experimental, commit your changes before running it'))}`
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
    const { codemods, projectCodemods, runCodemods } = await import('./codemods');
    runCodemods(codemods, projectCodemods);
    removePackage('@builder.io/qwik-labs');
    const { replaceImportInFiles } = await import('./rename-import');
    replaceImportInFiles(
      [
        ['QwikCityProvider', 'QwikRouterProvider'],
        ['qwikCity', 'qwikRouter'],
        ['QwikCityVitePluginOptions', 'QwikRouterVitePluginOptions'],
        ['QwikCityPlugin', 'QwikRouterPlugin'],
        ['createQwikCity', 'createQwikRouter'],
        ['QwikCityNodeRequestOptions', 'QwikRouterNodeRequestOptions'],
        ['QwikCityAwsLambdaOptions', 'QwikRouterAwsLambdaOptions'],
        ['QwikCityAzureOptions', 'QwikRouterAzureOptions'],
        ['QwikCityBunOptions', 'QwikRouterBunOptions'],
        ['QwikCityCloudflarePagesOptions', 'QwikRouterCloudflarePagesOptions'],
        ['QwikCityDenoOptions', 'QwikRouterDenoOptions'],
        ['QwikCityFirebaseOptions', 'QwikRouterFirebaseOptions'],
        ['QwikCityNetlifyOptions', 'QwikRouterNetlifyOptions'],
        ['QwikCityVercelEdgeOptions', 'QwikRouterVercelEdgeOptions'],
        ['QwikCityProps', 'QwikRouterProps'],
        ['QwikCityPlan', 'QwikRouterConfig'],
        ['QwikCityMockProvider', 'QwikRouterMockProvider'],
        ['QwikCityMockProps', 'QwikRouterMockProps'],
        ['QwikCityMockActionProp', 'QwikRouterMockActionProp'],
        ['QwikCityMockLoaderProp', 'QwikRouterMockLoaderProp'],
        ['staticAdapter', 'ssgAdapter'],
        ['StaticGenerateAdapterOptions', 'SsgAdapterOptions'],
        ['StaticGenerateRenderOptions', 'SsgRenderOptions'],
        ['StaticGenerateOptions', 'SsgOptions'],
      ],
      '@builder.io/qwik-city'
    );
    replaceImportInFiles(
      [
        ['qwikRollup', 'qwikRolldown'],
        ['QwikRollupPluginOptions', 'QwikRolldownPluginOptions'],
      ],
      '@builder.io/qwik/optimizer'
    );
    replaceImportInFiles(
      [['qwikCityPlan', 'qwikRouterConfig']],
      '@qwik-city-plan' // using old name, package name will be updated in the next step
    );

    warnMentions('⭐️', 'scoped style classes use the `⚡️` prefix instead of `⭐️` in v2.');
    warnMentions('q-data.json', 'v2 fetches route data from `q-loader-*.json` files instead.');
    warnMentions(
      'qwik/json',
      'v2 serializes the state into `qwik/state` and `qwik/vnode` scripts.'
    );
    for (const attr of ['[on:', 'on-window:', 'on-document:']) {
      warnMentions(attr, 'v2 renders listeners as `q-e:`, `q-w:` and `q-d:` attributes.');
    }
    warnMentions(
      '@builder.io/qwik-auth',
      '"@builder.io/qwik-auth" has no v2 version, use "@auth/qwik" (see https://qwik.dev/docs/integrations/authjs/).'
    );
    warnMentions(
      '@qwik-city-not-found-paths',
      '"@qwik-city-not-found-paths" does not exist in v2, the router renders 404 pages itself.'
    );
    // the vercel-edge adapter writes its routes config for this function name
    replacePackage('_qwik-city.func', '_qwik-router.func', true);
    replacePackage('@qwik-city-plan', '@qwik-router-config', true);
    replacePackage('@qwik-city-entries', '@qwik-router-entries', true);
    replacePackage('@qwik-city-sw-register', '@qwik-router-sw-register', true);
    replacePackage('@qwik-city-static-paths', '@qwik.dev/router/middleware/request-handler', true);
    replacePackage(
      '@builder.io/qwik-city/adapters/static/vite',
      '@qwik.dev/router/adapters/ssg/vite',
      true
    );
    replacePackage('@builder.io/qwik-city/static', '@qwik.dev/router/ssg', true);
    replacePackage('@builder.io/qwik-city', '@qwik.dev/router');
    replacePackage('@builder.io/qwik-react', '@qwik.dev/react');
    // "@builder.io/qwik" should be the last one because it's name is a substring of the package names above
    replacePackage('@builder.io/qwik', '@qwik.dev/core');

    if (installedTsMorph) {
      await removeTsMorphFromPackageJson();
    }

    updateConfigurations();

    await updateDependencies();
    const warnings = takeWarnings();
    log.info(
      `${bold('Behavior changes of v2 that could not be migrated:')}\n${V2_BEHAVIOR_CHANGES.map((c) => `  - ${c}`).join('\n')}`
    );
    if (warnings.length) {
      log.warn(
        `${bold('Some changes need your attention:')}\n${warnings.map((w) => `  - ${w}`).join('\n')}`
      );
    }
    log.success(`${green(`Your application has been successfully migrated to v2!`)}`);
  } catch (error) {
    console.error(error);
    throw error;
  }
}
