import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PackageJSON } from 'scripts/util';
import { getStarters } from '.';
import type { GenerateOptions, GenerateResult, StarterData, Starters } from '../types';
import {
  cp,
  mergePackageJSONs,
  readPackageJson,
  Replacements,
  toDashCase,
  writePackageJson,
} from './utils-api';

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
    serverId: opts.serverId,
    outDir: opts.outDir,
  };

  const starters = await getStarters();
  const starterApp = starters.apps.find((s) => s.id === opts.appId);
  const starterServer = starters.servers.find((s) => s.id === opts.serverId);
  const starterFeatures = starters.features.filter((s) => opts.featureIds.includes(s.id));

  if (starterApp) {
    generateUserStarter(starters, result, starterApp, starterServer, starterFeatures);
  } else {
    throw new Error(`Invalid starter id "${opts.appId}".`);
  }

  return result;
}

function generateUserStarter(
  starters: Starters,
  result: GenerateResult,
  starterApp: StarterData,
  starterServer: StarterData | undefined,
  features: StarterData[]
) {
  const replacements: Replacements = [[/\bqwik-project-name\b/g, result.projectName]];

  const baseApp = starters.apps.find((a) => a.id === 'base');
  if (!baseApp) {
    throw new Error(`Unable to find base app.`);
  }

  if (starterServer) {
    const serverPkgJson = readPackageJson(starterServer.dir);
    const vite = serverPkgJson.__qwik__?.vite;
    replacements.push([/\/\* VITE_IMPORTS \*\//g, vite?.VITE_IMPORTS ?? '']);
    replacements.push([/\/\* VITE_CONFIG \*\//g, vite?.VITE_CONFIG ?? '']);
    replacements.push([/\/\* VITE_QWIK \*\//g, vite?.VITE_QWIK ?? '']);
    replacements.push([/\/\* VITE_PLUGINS \*\//g, vite?.VITE_PLUGINS ?? '']);
  }

  cp(baseApp.dir, result.outDir, replacements);
  cp(starterApp.dir, result.outDir, replacements);

  const pkgJson = readPackageJson(baseApp.dir);
  const starterPkgJson = readPackageJson(starterApp.dir);
  mergePackageJSONs(pkgJson, starterPkgJson);
  const replaceProps = [
    'version',
    'private',
    'main',
    'module',
    'qwik',
    'types',
    'exports',
    'files',
  ];
  for (const prop of replaceProps) {
    if (starterPkgJson[prop] !== undefined) {
      pkgJson[prop] = starterPkgJson[prop];
    }
  }

  let readmeContent = baseApp.readme!.trim() + '\n\n';

  const featureBullets = [starterApp.description, 'Vite.js tooling.'];

  // Merge server package.json
  if (starterServer) {
    cp(starterServer.dir, result.outDir, replacements);

    const serverPkgJson = readPackageJson(starterServer.dir);
    mergePackageJSONs(pkgJson, serverPkgJson);

    if (serverPkgJson.description) {
      featureBullets.push(serverPkgJson.description);
    }

    if (starterServer.readme) {
      readmeContent += starterServer.readme.trim() + '\n\n';
    }
  }

  // Merge features package.json
  for (const feature of features) {
    cp(feature.dir, result.outDir, replacements);

    const featurerPkgJson = readPackageJson(feature.dir);
    mergePackageJSONs(pkgJson, featurerPkgJson);

    if (featurerPkgJson.description) {
      featureBullets.push(featurerPkgJson.description);
    }

    if (feature.readme) {
      readmeContent += feature.readme.trim() + '\n\n';
    }
  }

  pkgJson.name = toDashCase(result.projectName);
  pkgJson.description = featureBullets.join(' ').trim();

  const readmePath = join(result.outDir, 'README.md');
  const desciption = featureBullets
    .map((b) => `- ${b}`)
    .join('\n')
    .trim();

  const readme = [
    `# Qwik ${result.projectName} ⚡️`,
    ``,
    desciption,
    ``,
    readmeContent.trim(),
    ``,
    `--------------------`,
    ``,
    `## Related`,
    ``,
    `- [Qwik Docs](https://qwik.builder.io/)`,
    `- [Qwik Github](https://github.com/BuilderIO/qwik)`,
    `- [@QwikDev](https://twitter.com/QwikDev)`,
    `- [Discord](https://qwik.builder.io/chat)`,
    `- [Vite](https://vitejs.dev/)`,
    `- [Partytown](https://partytown.builder.io/)`,
    `- [Mitosis](https://github.com/BuilderIO/mitosis)`,
    `- [Builder.io](https://www.builder.io/)`,
  ].join('\n');

  writeFileSync(readmePath, readme.trim() + '\n');

  const cleanPkgJson = cleanPackageJson(pkgJson);
  writePackageJson(result.outDir, cleanPkgJson);
}

function cleanPackageJson(srcPkg: PackageJSON) {
  srcPkg = { ...srcPkg };

  const cleanedPkg: any = {
    name: srcPkg.name,
    version: srcPkg.version,
    description: srcPkg.description,
    scripts: srcPkg.scripts,
    dependencies: srcPkg.dependencies,
    devDependencies: srcPkg.devDependencies,
  };

  Object.keys(cleanedPkg).forEach((prop) => {
    delete (srcPkg as any)[prop];
  });
  delete srcPkg.__qwik__;

  const sortedKeys = Object.keys(srcPkg).sort();
  for (const key of sortedKeys) {
    cleanedPkg[key] = (srcPkg as any)[key];
  }

  return cleanedPkg as PackageJSON;
}

function isValidOption(value: any) {
  return typeof value === 'string' && value.trim().length > 0;
}
