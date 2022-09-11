import fs from 'fs';
import { join } from 'path';
import type { IntegrationData, IntegrationType } from '../types';
import { dashToTitlelCase, readPackageJson } from './utils';

let integrations: IntegrationData[] | null = null;

export async function loadIntegrations() {
  if (!integrations) {
    const loadingIntegrations: IntegrationData[] = [];
    const integrationTypes: IntegrationType[] = ['app', 'feature', 'server', 'static-generator'];

    const integrationsDir = join(__dirname, 'starters');
    const integrationsDirNames = await fs.promises.readdir(integrationsDir);

    await Promise.all(
      integrationsDirNames.map(async (integrationsDirName) => {
        const integrationType = integrationsDirName.slice(0, integrationsDirName.length - 1) as any;
        if (integrationTypes.includes(integrationType)) {
          const dir = join(integrationsDir, integrationsDirName);

          const dirItems = await fs.promises.readdir(dir);
          await Promise.all(
            dirItems.map(async (dirItem) => {
              const dirPath = join(dir, dirItem);
              const stat = await fs.promises.stat(dirPath);
              if (stat.isDirectory()) {
                const pkgJson = await readPackageJson(dirPath);
                const integration: IntegrationData = {
                  id: dirItem,
                  name: dashToTitlelCase(dirItem),
                  description: pkgJson.description ?? '',
                  type: integrationType,
                  dir: dirPath,
                  pkgJson,
                  priority: pkgJson?.__qwik__?.priority ?? 0,
                  featureOptions: pkgJson?.__qwik__?.featureOptions ?? [],
                  featureEnabled: pkgJson?.__qwik__?.featureEnabled ?? [],
                  viteConfig: pkgJson?.__qwik__?.viteConfig,
                };
                loadingIntegrations.push(integration);
              }
            })
          );
        }
      })
    );

    loadingIntegrations.sort((a, b) => {
      if (a.priority > b.priority) return -1;
      if (a.priority < b.priority) return 1;
      return a.id < b.id ? -1 : 1;
    });

    integrations = loadingIntegrations;
  }

  return integrations;
}
