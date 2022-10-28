import type { FsUpdates, UpdateAppOptions, UpdateAppResult } from '../types';
import { dirname } from 'node:path';
import fs from 'node:fs';
import { getPackageManager, panic } from '../utils/utils';
import { loadIntegrations } from '../utils/integrations';
import { installDeps, startSpinner } from '../utils/install-deps';
import { mergeIntegrationDir } from './update-files';
import { updateViteConfigs } from './update-vite-config';
import color from 'kleur';

export async function updateApp(opts: UpdateAppOptions) {
  const integrations = await loadIntegrations();
  const integration = integrations.find((s) => s.id === opts.integration);
  if (!integration) {
    throw new Error(`Unable to find integration "${opts.integration}"`);
  }

  const fileUpdates: FsUpdates = {
    files: [],
    installedDeps: {},
  };

  if (opts.installDeps) {
    fileUpdates.installedDeps = {
      ...integration.pkgJson.dependencies,
      ...integration.pkgJson.devDependencies,
    };
  }

  await mergeIntegrationDir(fileUpdates, opts, integration.dir, opts.rootDir);

  if ((globalThis as any).CODE_MOD) {
    await updateViteConfigs(fileUpdates, integration, opts.rootDir);
  }

  const commit = async (showSpinner?: boolean) => {
    const isInstallingDeps = Object.keys(fileUpdates.installedDeps).length > 0;

    const spinner = showSpinner
      ? startSpinner(`Updating app${isInstallingDeps ? ' and installing dependencies' : ''}...`)
      : null;

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

      const pkgManager = getPackageManager();
      if (opts.installDeps && Object.keys(fileUpdates.installedDeps).length > 0) {
        const { install } = installDeps(pkgManager, opts.rootDir);
        passed = await install;
      }

      await fsWrites;
      spinner && spinner.succeed();
      if (!passed) {
        const errorMessage = `\n\n❌ ${color.bgRed(
          `  ${pkgManager} install failed  `
        )}\n\n   You might need to run "${color.green(
          `${pkgManager} install`
        )}" manually inside the root of the project.\n\n`;

        console.error(errorMessage);
      }
    } catch (e) {
      spinner && spinner.fail();
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
