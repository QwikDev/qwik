import { log, spinner } from '@clack/prompts';
import { bgRed, cyan } from 'kleur/colors';
import fs from 'node:fs';
import { dirname } from 'node:path';
import type { FsUpdates, UpdateAppOptions, UpdateAppResult } from '../types';
import { installDeps } from '../utils/install-deps';
import { loadIntegrations } from '../utils/integrations';
import { panic } from '../utils/utils';
import { mergeIntegrationDir } from './update-files';
import { updateViteConfigs } from './update-vite-config';

export async function updateApp(pkgManager: string, opts: UpdateAppOptions) {
  const integrations = await loadIntegrations();
  const integration = integrations.find((s) => s.id === opts.integration);
  if (!integration) {
    throw new Error(`Unable to find integration "${opts.integration}"`);
  }

  const fileUpdates: FsUpdates = {
    files: [],
    installedDeps: {},
    installedScripts: Object.keys(integration.pkgJson.scripts || {}),
  };

  if (opts.installDeps) {
    fileUpdates.installedDeps = {
      ...integration.pkgJson.dependencies,
      ...integration.pkgJson.devDependencies,
    };
  }

  await mergeIntegrationDir(
    fileUpdates,
    opts,
    integration.dir,
    opts.rootDir,
    integration.alwaysInRoot
  );

  if ((globalThis as any).CODE_MOD) {
    await updateViteConfigs(fileUpdates, integration, opts.rootDir);
  }

  const commit = async (showSpinner?: boolean) => {
    const isInstallingDeps = Object.keys(fileUpdates.installedDeps).length > 0;

    const s = spinner();
    if (showSpinner) {
      s.start(`Updating app${isInstallingDeps ? ' and installing dependencies' : ''}...`);
    }

    let passed = true;
    try {
      const dirs = new Set(fileUpdates.files.map((f) => dirname(f.path)));
      for (const dir of Array.from(dirs)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
          //
        }
      }

      const fsWrites = Promise.all(
        fileUpdates.files.map(async (f) => {
          await fs.promises.writeFile(f.path, f.content);
        })
      );

      if (opts.installDeps && Object.keys(fileUpdates.installedDeps).length > 0) {
        const { install } = installDeps(pkgManager, opts.rootDir);
        passed = await install;
      }

      await fsWrites;

      showSpinner && s.stop('App updated');

      if (!passed) {
        const errorMessage = `${bgRed(
          ` ${pkgManager} install failed `
        )}\n You might need to run "${cyan(
          `${pkgManager} install`
        )}" manually inside the root of the project.`;

        log.error(errorMessage);
      }
    } catch (e) {
      showSpinner && s.stop('App updated');
      panic(String(e));
    }
  };

  const result: UpdateAppResult = {
    rootDir: opts.rootDir,
    integration,
    updates: fileUpdates,
    commit,
  };
  return result;
}
