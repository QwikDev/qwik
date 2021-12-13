import { readdirSync } from 'fs';
import { join } from 'path';
import type { CliStarterData, CliStarters } from 'scripts/util';
import { dashToTitlelCase, readPackageJson } from './utils';

export function loadStarters(startersDir: string) {
  const starters: CliStarters = {
    apps: loadStarterData(startersDir, 'apps'),
    servers: loadStarterData(startersDir, 'servers'),
  };
  return starters;
}

function loadStarterData(startersDir: string, dirName: string) {
  const dir = join(startersDir, dirName);
  const ids = readdirSync(dir);

  return ids
    .map((id) => {
      const dataDir = join(dir, id);
      const pkgJson = readPackageJson(dataDir);

      const data: CliStarterData = {
        id,
        name: dashToTitlelCase(id),
        description: pkgJson.description!,
        dir: dataDir,
      };
      return data;
    })
    .sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
}
