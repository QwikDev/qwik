import { log } from '@clack/prompts';
import type { AppCommand } from '../utils/app-command';
import { runInPkg } from '../utils/install-deps';
import { getPackageManager } from '../utils/utils';
import { BUILD_ARGS } from './constant';

/**
 * Builds the application using the appropriate package manager.
 *
 * @param {AppCommand} app - The application command object containing app details.
 * @param {string} manifestPath - The path to the manifest file (though it's not used in the current
 *   function).
 * @throws {Error} Throws an error if the build process encounters any issues.
 */

export async function goBuild(app: AppCommand, manifestPath: string) {
  const pkgManager = getPackageManager();
  try {
    const { install } = await runInPkg(pkgManager, BUILD_ARGS, app.rootDir);
    if (!(await install)) {
      throw new Error('Client build command reported failure.');
    }
  } catch (buildError: any) {
    log.error(`Build error: ${buildError.message}`);
    throw new Error('Client build process encountered an error.');
  }
}
