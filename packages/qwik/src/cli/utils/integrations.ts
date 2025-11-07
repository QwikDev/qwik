import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntegrationData, IntegrationType } from '../types';
import { dashToTitleCase, limitLength, readPackageJson } from './utils';

const __dirname = dirname(fileURLToPath(import.meta.url));

let integrations: IntegrationData[] | null = null;

export async function sortIntegrationsAndReturnAsClackOptions(
  integrations: IntegrationData[],
  { maxHintLength = 50, showHint = true }: { maxHintLength?: number; showHint?: boolean } = {}
) {
  return integrations
    .sort((a, b) => {
      if (a.priority > b.priority) {
        return -1;
      }
      if (a.priority < b.priority) {
        return 1;
      }
      return a.id < b.id ? -1 : 1;
    })
    .map((i) => ({
      value: i.id,
      label: i.name,
      hint: (showHint && limitLength(i.pkgJson.description, maxHintLength)) || undefined,
    }));
}

export async function loadIntegrations() {
  if (!integrations) {
    const loadingIntegrations: IntegrationData[] = [];
    const integrationTypes: IntegrationType[] = ['app', 'feature', 'adapter'];

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
                  name: pkgJson.__qwik__?.displayName ?? dashToTitleCase(dirItem),
                  type: integrationType,
                  dir: dirPath,
                  pkgJson,
                  docs: pkgJson.__qwik__?.docs ?? [],
                  priority: pkgJson?.__qwik__?.priority ?? 0,
                  alwaysInRoot: pkgJson.__qwik__?.alwaysInRoot ?? [],
                };
                loadingIntegrations.push(integration);
              }
            })
          );
        }
      })
    );

    loadingIntegrations.sort((a, b) => {
      if (a.priority > b.priority) {
        return -1;
      }
      if (a.priority < b.priority) {
        return 1;
      }
      return a.id < b.id ? -1 : 1;
    });

    integrations = loadingIntegrations;
  }

  return integrations;
}
