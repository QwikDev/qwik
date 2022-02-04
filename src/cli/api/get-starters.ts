import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import type { StarterData, Starters } from '../types';
import { dashToTitlelCase, readPackageJson } from './utils-api';

let starters: Starters | null = null;

export async function getStarters() {
  if (starters == null) {
    starters = loadStarters(join(__dirname, 'starters'));
  }
  return starters;
}

function loadStarters(startersDir: string) {
  const starters: Starters = {
    apps: loadStarterData(startersDir, 'apps'),
    servers: loadStarterData(startersDir, 'servers'),
    features: loadStarterData(startersDir, 'features'),
  };
  return starters;
}

function loadStarterData(startersDir: string, dirName: string) {
  const dir = join(startersDir, dirName);
  const ids = readdirSync(dir);

  return ids
    .filter((id) => {
      const s = statSync(join(dir, id));
      return s.isDirectory();
    })
    .map((id) => {
      const dataDir = join(dir, id);
      const pkgJson = readPackageJson(dataDir);

      const data: StarterData = {
        id,
        name: dashToTitlelCase(id),
        description: pkgJson.description ?? '',
        dir: dataDir,
        priority: pkgJson.priority ?? 0,
      };
      return data;
    })
    .sort((a, b) => {
      if (a.priority > b.priority) return -1;
      if (a.priority < b.priority) return 1;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
}
