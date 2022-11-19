import type { FsUpdates, UpdateAppOptions } from '../types';
import fs from 'node:fs';
import { join } from 'node:path';
import { getPackageManager } from '../utils/utils';

export async function mergeIntegrationDir(
  fileUpdates: FsUpdates,
  opts: UpdateAppOptions,
  srcDir: string,
  destDir: string
) {
  const items = await fs.promises.readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      const destName = itemName === 'gitignore' ? '.gitignore' : itemName;
      const srcChildPath = join(srcDir, itemName);
      const destChildPath = join(destDir, destName);
      const s = await fs.promises.stat(srcChildPath);

      if (s.isDirectory()) {
        // await fs.promises.mkdir(destChildPath, { recursive: true });
        await mergeIntegrationDir(fileUpdates, opts, srcChildPath, destChildPath);
      } else if (s.isFile()) {
        if (destName === 'package.json') {
          await mergePackageJsons(fileUpdates, srcChildPath, destChildPath);
        } else if (destName === 'README.md') {
          await mergeReadmes(fileUpdates, srcChildPath, destChildPath);
        } else if (destName === '.gitignore') {
          await mergeGitIgnores(fileUpdates, srcChildPath, destChildPath);
        } else {
          if (fs.existsSync(destChildPath)) {
            fileUpdates.files.push({
              path: destChildPath,
              content: await fs.promises.readFile(srcChildPath, 'utf-8'),
              type: 'overwrite',
            });
          } else {
            fileUpdates.files.push({
              path: destChildPath,
              content: await fs.promises.readFile(srcChildPath),
              type: 'create',
            });
          }
        }
      }
    })
  );
}

async function mergePackageJsons(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');
  const srcPkgJson = JSON.parse(srcContent);

  const props = ['scripts', 'dependencies', 'devDependencies'];
  try {
    const destPkgJson = JSON.parse(await fs.promises.readFile(destPath, 'utf-8'));
    props.forEach((prop) => {
      mergePackageJsonSort(srcPkgJson, destPkgJson, prop);
    });
    if (destPkgJson.scripts?.qwik) {
      const qwikVal = destPkgJson.scripts.qwik;
      delete destPkgJson.scripts.qwik;
      destPkgJson.scripts.qwik = qwikVal;
    }
    fileUpdates.files.push({
      path: destPath,
      content: JSON.stringify(destPkgJson, null, 2) + '\n',
      type: 'modify',
    });
  } catch (e) {
    fileUpdates.files.push({
      path: destPath,
      content: srcContent,
      type: 'create',
    });
  }
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

async function mergeReadmes(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  let type: 'create' | 'modify';
  let destContent = '';
  try {
    destContent = await fs.promises.readFile(destPath, 'utf-8');
    destContent = destContent.trim() + '\n\n' + srcContent;
    type = 'modify';
  } catch (e) {
    destContent = srcContent;
    type = 'create';
  }

  const pkgManager = getPackageManager();
  if (pkgManager !== 'npm') {
    destContent = destContent.replace(/npm run/g, pkgManager);
  }

  fileUpdates.files.push({
    path: destPath,
    content: destContent.trim() + '\n',
    type,
  });
}

async function mergeGitIgnores(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  try {
    const destContent = await fs.promises.readFile(destPath, 'utf-8');
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
    fileUpdates.files.push({
      path: destPath,
      content: destLines.join('\n').trim() + '\n',
      type: 'modify',
    });
  } catch (e) {
    fileUpdates.files.push({
      path: destPath,
      content: srcContent,
      type: 'create',
    });
  }
}
