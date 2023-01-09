import { ServerAdaptorOptions, viteAdaptor } from '../../shared/vite';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * @alpha
 */
export function azureSwaAdaptor(opts: AzureSwaAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'azure-swa',
    origin: process?.env?.URL || 'https://yoursitename.region.2.azurestaticapps.net',
    staticGenerate: opts.staticGenerate,
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    async generate({ outputEntries, serverOutDir }) {
      const serverPackageJsonPath = join(serverOutDir!, 'package.json');
      const serverPackageJsonCode = `{"type":"module"}`;
      await fs.promises.mkdir(serverOutDir!, { recursive: true });
      await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

      const azureSwaModulePath = outputEntries.find((entryName) => entryName === 'entry.azure-swa');

      const funcJsonPath = join(serverOutDir!, 'function.json');
      const funcJson = JSON.stringify(
        {
          bindings: [
            {
              authLevel: 'anonymous',
              type: 'httpTrigger',
              direction: 'in',
              name: 'req',
              methods: [
                'get',
                'head',
                'post',
                'put',
                'delete',
                'connect',
                'options',
                'trace',
                'patch',
              ],
            },
            {
              type: 'http',
              direction: 'out',
              name: 'response',
            },
          ],
          scriptFile: azureSwaModulePath,
        },
        null,
        2
      );
      await fs.promises.writeFile(funcJsonPath, funcJson);
    },
  });
}

/**
 * @alpha
 */
export interface AzureSwaAdaptorOptions extends ServerAdaptorOptions {}
