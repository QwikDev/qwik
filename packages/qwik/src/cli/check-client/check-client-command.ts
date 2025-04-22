#!/usr/bin/env node';
import { intro, log, outro } from '@clack/prompts';
import { bgBlue, bgMagenta, bold, cyan } from 'kleur/colors';
import type { AppCommand } from '../utils/app-command';
import { isCheckDisk } from './check-disk';
import { DISK_DIR, SRC_DIR } from './constant';
import { getLatestMtime } from './get-latest-m-time';
import { getManifestFile } from './get-manifest-file';
import { goBuild } from './build';

/**
 * Handles the core logic for the 'check-client' command. Exports this function so other modules can
 * import and call it.
 *
 * @param {AppCommand} app - Application command context (assuming structure).
 */
export async function checkClientCommand(app: AppCommand, manifestPath: string): Promise<void> {
  intro(`🚀 ${bgBlue(bold(' Qiwk Client Check '))}`);

  log.step(`Checking Disk directory: ${cyan(DISK_DIR)}`);

  if (await isCheckDisk()) {
    await goBuild(app, manifestPath);
  } else {
    log.step(`Checking q-manifest.json file: ${cyan(DISK_DIR)}`);
    const manifest = await getManifestFile(manifestPath);
    if (!manifest) {
      await goBuild(app, manifestPath);
    } else {
      log.step(`Compare source modification time with q-manifest.json modification time`);
      if (await getLatestMtime(SRC_DIR, manifest)) {
        await goBuild(app, manifestPath);
      }
    }
  }

  outro(`✅ ${bgMagenta(bold(' Check complete '))}`);
}
