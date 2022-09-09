import { getPackageManager, readPackageJson, writePackageJson } from './utils';
import fs from 'fs';
import { join } from 'path';
import type { UpdateAppOptions } from './types';
import { loadStarterData } from './starters';
import { mergeViteConfigContents } from './merge-configs';

export async function updateApp(opts: UpdateAppOptions) {
  if (opts.addIntegration) {
    const [features, servers, staticGenerators] = await Promise.all([
      loadStarterData('features'),
      loadStarterData('servers'),
      loadStarterData('static-generators'),
    ]);
    const integrations = [...features, ...servers, ...staticGenerators];
    const integration = integrations.find((s) => s.id === opts.addIntegration);
    if (!integration) {
      throw new Error(`Unable to find integration "${opts.addIntegration}"`);
    }

    await mergeStarterDir(integration.dir, opts.rootDir);
  }
}

async function mergeStarterDir(srcDir: string, destDir: string) {
  const items = await fs.promises.readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      const destName = itemName === 'gitignore' ? '.gitignore' : itemName;
      const srcChildPath = join(srcDir, itemName);
      const destChildPath = join(destDir, destName);
      const s = await fs.promises.stat(srcChildPath);

      if (s.isDirectory()) {
        await fs.promises.mkdir(destChildPath, { recursive: true });
        await mergeStarterDir(srcChildPath, destChildPath);
      } else if (s.isFile()) {
        if (destName === 'package.json') {
          await mergePackageJsons(srcDir, destDir);
        } else if (destName === 'vite.config.ts') {
          await mergeViteConfigs(srcChildPath, destChildPath);
        } else if (destName === 'README.md') {
          await mergeReadmes(srcChildPath, destChildPath);
        } else if (destName === '.gitignore') {
          await mergeGitIgnores(srcChildPath, destChildPath);
        } else {
          await fs.promises.copyFile(srcChildPath, destChildPath);
        }
      }
    })
  );
}

async function mergePackageJsons(srcDir: string, destDir: string) {
  const srcPkgJson = await readPackageJson(srcDir);
  let destPkgJson: any = {};
  try {
    destPkgJson = await readPackageJson(destDir);
  } catch (e) {
    //
  }

  const props = ['scripts', 'dependencies', 'devDependencies'];
  props.forEach((prop) => {
    mergePackageJsonSort(srcPkgJson, destPkgJson, prop);
  });

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
    if (destPkgJson[prop] === undefined && srcPkgJson[prop] !== undefined) {
      destPkgJson[prop] = srcPkgJson[prop];
    }
  }

  delete destPkgJson.__qwik__;

  await writePackageJson(destDir, destPkgJson);
}

function mergePackageJsonSort(src: any, dest: any, prop: string) {
  if (src[prop]) {
    if (dest[prop]) {
      Object.assign(dest[prop], { ...src[prop] });
    } else {
      dest[prop] = { ...src[prop] };
    }

    const sorted: any = {};
    const keys = Object.keys(dest[prop]).sort();
    for (const key of keys) {
      sorted[key] = dest[prop][key];
    }
    dest[prop] = sorted;
  }
}

async function mergeViteConfigs(srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  try {
    let destContent = await fs.promises.readFile(destPath, 'utf-8');
    destContent = mergeViteConfigContents(srcContent, destContent);
    await fs.promises.writeFile(destPath, destContent);
  } catch (e) {
    await fs.promises.writeFile(destPath, srcContent.trim() + '\n');
  }
}

async function mergeReadmes(srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  let destContent = '';
  try {
    destContent = await fs.promises.readFile(destPath, 'utf-8');
    destContent += '\n\n' + srcContent;
  } catch (e) {
    destContent = srcContent;
  }

  const pkgManager = getPackageManager();
  if (pkgManager === 'yarn') {
    destContent = destContent.replace(/npm run/g, 'yarn');
  }
  destContent = destContent.trim() + '\n';

  await fs.promises.writeFile(destPath, destContent);
}

async function mergeGitIgnores(srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  try {
    let destContent = await fs.promises.readFile(destPath, 'utf-8');
    const srcLines = srcContent.trim().split(/\r?\n/);
    const destLines = destContent.trim().split(/\r?\n/);
    for (const srcLine of srcLines) {
      if (!destLines.includes(srcLine)) {
        if (srcLine.startsWith('#')) {
          destLines.push('');
        }
        destLines.push(srcLine);
      }
    }

    destContent = destLines.join('\n').trim() + '\n';

    await fs.promises.writeFile(destPath, destContent);
  } catch (e) {
    await fs.promises.writeFile(destPath, srcContent.trim() + '\n');
  }
}
