import { JsonParser, JsonObjectNode } from '@croct/json5-parser';
import fs from 'node:fs';
import { extname, join } from 'node:path';
import type { FsUpdates, UpdateAppOptions } from '../types';
import { getPackageManager } from '../utils/utils';

export async function mergeIntegrationDir(
  fileUpdates: FsUpdates,
  opts: UpdateAppOptions,
  srcDir: string,
  destDir: string,
  alwaysInRoot?: string[]
) {
  const items = await fs.promises.readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      const destName = itemName === 'gitignore' ? '.gitignore' : itemName;
      const ext = extname(destName);
      const srcChildPath = join(srcDir, itemName);

      const destRootPath = join(destDir, destName);

      const s = await fs.promises.stat(srcChildPath);

      if (s.isDirectory()) {
        await mergeIntegrationDir(fileUpdates, opts, srcChildPath, destRootPath, alwaysInRoot);
      } else if (s.isFile()) {
        const finalDestPath = getFinalDestPath(opts, destRootPath, destDir, destName, alwaysInRoot);

        if (destName === 'package.json') {
          await mergePackageJsons(fileUpdates, srcChildPath, destRootPath);
        } else if (destDir.endsWith('.vscode') && destName === 'settings.json') {
          await mergeVSCodeSettings(fileUpdates, srcChildPath, finalDestPath);
        } else if (destName === 'README.md') {
          await mergeReadmes(fileUpdates, srcChildPath, finalDestPath);
        } else if (
          destName === '.gitignore' ||
          destName === '.prettierignore' ||
          destName === '.eslintignore'
        ) {
          await mergeIgnoresFile(fileUpdates, srcChildPath, destRootPath);
        } else if (ext === '.css') {
          await mergeCss(fileUpdates, srcChildPath, finalDestPath, opts);
        } else if (fs.existsSync(finalDestPath)) {
          fileUpdates.files.push({
            path: finalDestPath,
            content: await fs.promises.readFile(srcChildPath),
            type: 'overwrite',
          });
        } else {
          fileUpdates.files.push({
            path: finalDestPath,
            content: await fs.promises.readFile(srcChildPath),
            type: 'create',
          });
        }
      }
    })
  );
}

function getFinalDestPath(
  opts: UpdateAppOptions,
  destRootPath: string,
  destDir: string,
  destName: string,
  alwaysInRoot?: string[]
) {
  // If the integration has a projectDir, copy the files to the projectDir
  // Unless that path is part of "alwaysInRoot"
  const projectDir = opts.projectDir ? opts.projectDir : '';
  const rootDirEndIndex = destDir.indexOf(opts.rootDir) + opts.rootDir.length;
  const destWithoutRoot = destDir.slice(rootDirEndIndex);

  const destChildPath = join(opts.rootDir, projectDir, destWithoutRoot, destName);

  const finalDestPath =
    alwaysInRoot &&
    alwaysInRoot.some((rootItem) => destName.includes(rootItem) || destDir.includes(rootItem))
      ? destRootPath
      : destChildPath;

  return finalDestPath;
}

async function mergePackageJsons(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');
  try {
    const srcPkgJson = JSON.parse(srcContent);
    const props = ['scripts', 'dependencies', 'devDependencies'];
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

async function mergeVSCodeSettings(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');
  try {
    const srcPkgJson = JsonParser.parse(srcContent, JsonObjectNode);
    const destPkgJson = JsonParser.parse(
      await fs.promises.readFile(destPath, 'utf-8'),
      JsonObjectNode
    );
    destPkgJson.merge(srcPkgJson);

    fileUpdates.files.push({
      path: destPath,
      content: destPkgJson.toString() + '\n',
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
    destContent = destContent.replace(/\b(npm run|pnpm run|yarn( run)?)\b/g, pkgManager);
  }

  fileUpdates.files.push({
    path: destPath,
    content: destContent.trim() + '\n',
    type,
  });
}

async function mergeIgnoresFile(fileUpdates: FsUpdates, srcPath: string, destPath: string) {
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

async function mergeCss(
  fileUpdates: FsUpdates,
  srcPath: string,
  destPath: string,
  opts: UpdateAppOptions
) {
  const srcContent = await fs.promises.readFile(srcPath, 'utf-8');

  try {
    // css file already exists, prepend the src to the dest file
    const destContent = await fs.promises.readFile(destPath, 'utf-8');
    const mergedContent = srcContent.trim() + '\n\n' + destContent.trim() + '\n';

    const isAddingLibrary = opts.installDeps === true;
    // When it's integrating a css library, use merge strategy
    // Otherwise, it's initializing a new Qwik project, use overwrite strategy
    fileUpdates.files.push({
      path: destPath,
      content: isAddingLibrary ? mergedContent : srcContent,
      type: isAddingLibrary ? 'modify' : 'overwrite',
    });
  } catch (e) {
    // css file doesn't already exist, just copy it over
    fileUpdates.files.push({
      path: destPath,
      content: srcContent,
      type: 'create',
    });
  }
}
