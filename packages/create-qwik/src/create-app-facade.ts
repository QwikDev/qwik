import type { CreateAppOptions, CreateAppResult } from '../../qwik/src/cli/types';

import { createApp } from './create-app';
import { getPackageManager } from '../../qwik/src/cli/utils/utils';
import { makeTemplateManager } from './helpers/templateManager';

export async function createAppFacade(opts: CreateAppOptions): Promise<CreateAppResult> {
  const pkgManager = getPackageManager();

  const templateManager = await makeTemplateManager('app');

  return await createApp({
    appId: opts.starterId,
    templateManager,
    outDir: opts.outDir,
    pkgManager,
  });
}
