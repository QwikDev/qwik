import { existsSync, mkdirSync } from 'fs';
import { getStarters } from '.';
import type { GenerateOptions, GenerateResult, StarterData } from '../types';
import { cp, mergeSort, readPackageJson, Replacements, writePackageJson } from './utils-api';

export async function generateStarter(opts: GenerateOptions) {
  if (!isValidOption(opts.projectName)) {
    throw new Error(`Missing project name`);
  }
  if (!isValidOption(opts.appId)) {
    throw new Error(`Missing starter id`);
  }
  if (!isValidOption(opts.outDir)) {
    throw new Error(`Missing outDir`);
  }
  if (!existsSync(opts.outDir)) {
    mkdirSync(opts.outDir, { recursive: true });
  }

  const result: GenerateResult = {
    projectName: opts.projectName,
    appId: opts.appId,
    serverId: opts.serverId || '',
    outDir: opts.outDir,
  };

  const starters = await getStarters();
  const starterApp = starters.apps.find((s) => s.id === opts.appId);
  const starterServer = starters.servers.find((s) => s.id === opts.serverId);
  if (starterApp) {
    generateUserStarter(result, starterApp, starterServer);
  } else {
    throw new Error(`Invalid starter id "${opts.appId}".`);
  }

  return result;
}

function generateUserStarter(
  result: GenerateResult,
  starterApp: StarterData,
  starterServer: StarterData | undefined
) {
  const replacements: Replacements = [[/\bqwik-project-name\b/g, result.projectName]];
  cp(starterApp.dir, result.outDir, replacements);

  const pkgJson = readPackageJson(starterApp.dir);

  if (starterServer) {
    pkgJson.name = result.projectName.toLocaleLowerCase().replace(/ /g, '-');
    cp(starterServer.dir, result.outDir, replacements);

    const serverPkgJson = readPackageJson(starterServer.dir);
    mergeSort(pkgJson, serverPkgJson, 'scripts');
    mergeSort(pkgJson, serverPkgJson, 'dependencies');
    mergeSort(pkgJson, serverPkgJson, 'devDependencies');
  }
  delete pkgJson.priority;
  writePackageJson(result.outDir, pkgJson);
}

function isValidOption(value: any) {
  return typeof value === 'string' && value.trim().length > 0;
}
