import type { CreateAppResult, IntegrationData } from '../../qwik/src/cli/types';
import fs from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { cleanPackageJson, writePackageJson } from '../../qwik/src/cli/utils/utils';
import { updateApp } from '../../qwik/src/cli/add/update-app';
import { type TemplateManager } from './helpers/templateManager';

type Options = {
  appId: string;
  templateManager: TemplateManager;
  outDir: string;
  pkgManager: string;
};

type CreateFromStarterOptions = {
  pkgManager: string;
  baseApp: IntegrationData;
  starterApp?: IntegrationData;
  outDir: string;
};

function isValidOption(value: any) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateOptions(opts: Options) {
  if (!isValidOption(opts.outDir)) {
    throw new Error(`Missing outDir`);
  }

  if (!isAbsolute(opts.outDir)) {
    throw new Error(`outDir must be an absolute path`);
  }
}

export async function createApp(opts: Options): Promise<CreateAppResult> {
  const { appId, outDir, pkgManager, templateManager } = opts;

  const { baseApp, starterApp } = templateManager.getBootstrapApps(appId);

  validateOptions(opts);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(decodeURIComponent(outDir), { recursive: true });
  }

  const docs = await createFromStarter({ baseApp, starterApp, pkgManager, outDir });

  return { starterId: opts.appId, outDir, pkgManager, docs };
}

async function createFromStarter({
  baseApp,
  starterApp,
  outDir,
  pkgManager,
}: CreateFromStarterOptions): Promise<string[]> {
  const docs = [...baseApp.docs];

  const appInfo = starterApp ?? baseApp;

  const appPkgJson = cleanPackageJson({
    ...baseApp.pkgJson,
    name: `my-${appInfo.pkgJson.name}`,
    description: appInfo.pkgJson.description,
    scripts: undefined,
    dependencies: undefined,
    devDependencies: undefined,
  });

  await writePackageJson(outDir, appPkgJson);

  const readmePath = join(outDir, 'README.md');
  await fs.promises.writeFile(readmePath, '');

  const baseUpdate = await updateApp(pkgManager, {
    rootDir: outDir,
    integration: baseApp.id,
    installDeps: false,
  });

  await baseUpdate.commit(false);

  if (starterApp) {
    docs.push(...starterApp.docs);

    const starterUpdate = await updateApp(pkgManager, {
      rootDir: outDir,
      integration: starterApp.id,
      installDeps: false,
    });

    await starterUpdate.commit(false);
  }

  return docs;
}
