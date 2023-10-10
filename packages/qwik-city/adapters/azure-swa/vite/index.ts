import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';
import { join } from 'node:path';
import fs from 'node:fs';

/** @public */
export function azureSwaAdapter(opts: AzureSwaAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'azure-swa',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://yoursitename.region.2.azurestaticapps.net',
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    async generate({ outputEntries, serverOutDir, clientPublicOutDir }) {
      const serverPackageJsonPath = join(serverOutDir!, 'package.json');
      const serverPackageJsonCode = `{"type":"module"}`;
      await fs.promises.mkdir(serverOutDir!, { recursive: true });
      await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

      const azureSwaModulePath = outputEntries.find(
        (entryName) => entryName.indexOf('entry.azure-swa') === 0
      );

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
              name: '$return',
            },
          ],
          scriptFile: azureSwaModulePath,
        },
        null,
        2
      );
      await fs.promises.writeFile(funcJsonPath, funcJson);

      // Azure SWA needs an index.html in the dist folder (otherwise it won't deploy)
      if (!fs.existsSync(join(clientPublicOutDir, 'index.html'))) {
        await fs.promises.writeFile(join(clientPublicOutDir, 'index.html'), '');
      }
    },
  });
}

/** @public */
export interface AzureSwaAdapterOptions extends ServerAdapterOptions {}

/** @public */
export type { StaticGenerateRenderOptions };
