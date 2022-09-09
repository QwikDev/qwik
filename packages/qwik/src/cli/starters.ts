import fs from 'fs';
import { join } from 'path';
import type { StarterData, StarterType } from './types';
import { readPackageJson } from './utils';

const starterCache: Record<string, StarterData[]> = {};

export async function loadIntegrations(starterType: StarterType) {}

export async function loadStarterData(starterType: StarterType) {
  if (!starterCache[starterType]) {
    const dir = join(__dirname, 'starters', starterType);
    const ids = await fs.promises.readdir(dir);

    const starters = await Promise.all(
      ids
        .filter((id) => {
          const s = fs.statSync(join(dir, id));
          return s.isDirectory();
        })
        .map(async (id) => {
          const dataDir = join(dir, id);
          const pkgJson = await readPackageJson(dataDir);

          const data: StarterData = {
            id,
            name: dashToTitlelCase(id),
            description: pkgJson.description ?? '',
            dir: dataDir,
            pkgJson,
            priority: pkgJson?.__qwik__?.priority ?? 0,
            featureOptions: pkgJson?.__qwik__?.featureOptions ?? [],
            featureEnabled: pkgJson?.__qwik__?.featureEnabled ?? [],
          };
          return data;
        })
    );

    starterCache[starterType] = starters.sort((a, b) => {
      if (a.priority > b.priority) return -1;
      if (a.priority < b.priority) return 1;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
  }

  return starterCache[starterType];
}

function dashToTitlelCase(str: string) {
  return str
    .toLocaleLowerCase()
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
