import type { FsUpdates, IntegrationData } from '../types';
import fs from 'fs';
import { join } from 'path';
import { updateViteConfig } from '../code-mod/code-mod';
import type { Options } from 'prettier';
import { panic } from '../utils/utils';

export async function updateViteConfigs(
  fileUpdates: FsUpdates,
  integration: IntegrationData,
  rootDir: string
) {
  try {
    const viteConfig = integration.pkgJson.__qwik__?.viteConfig;
    if (viteConfig) {
      let viteConfigPath = join(rootDir, 'vite.config.ts');
      if (!fs.existsSync(viteConfigPath)) {
        viteConfigPath = join(rootDir, 'vite.config.mts');
      }
      if (!fs.existsSync(viteConfigPath)) {
        throw new Error(`Could not find vite.config.ts or vite.config.mts in ${rootDir}`);
      }
      const destContent = await fs.promises.readFile(viteConfigPath, 'utf-8');

      const ts = (await import('typescript')).default;
      let updatedContent = updateViteConfig(ts, destContent, viteConfig);

      if (updatedContent) {
        try {
          const prettier = (await import('prettier')).default;

          let prettierOpts: Options = {
            filepath: viteConfigPath,
          };

          const opts = await prettier.resolveConfig(viteConfigPath);
          if (opts) {
            prettierOpts = { ...opts, ...prettierOpts };
          }

          updatedContent = await prettier.format(updatedContent, prettierOpts);

          updatedContent = updatedContent.replace(`export default`, `\nexport default`);
        } catch (e) {
          console.error(e);
        }

        fileUpdates.files.push({
          path: viteConfigPath,
          content: updatedContent,
          type: 'modify',
        });
      }
    }
  } catch (e) {
    panic(String(e));
  }
}
