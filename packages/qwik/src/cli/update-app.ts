import { getPackageManager, panic } from './utils';
import fs from 'fs';
import { dirname, join } from 'path';
import type { FsUpdates, IntegrationData, UpdateAppOptions, UpdateAppResult } from './types';
import { loadIntegrations } from './integrations';
import { updateViteConfig } from './code-mod';
import { installDeps, startSpinner } from './install-deps';
import type { Options } from 'prettier';

export async function updateApp(opts: UpdateAppOptions) {
  const integrations = await loadIntegrations();
  const integration = integrations.find((s) => s.id === opts.integration);
  if (!integration) {
    throw new Error(`Unable to find integration "${opts.integration}"`);
  }

  const fileUpdates: FsUpdates = {
    files: [],
    installedDeps: {},
  };

  if (opts.installDeps) {
    fileUpdates.installedDeps = {
      ...integration.pkgJson.dependencies,
      ...integration.pkgJson.devDependencies,
    };
  }

  await mergeIntegrationDir(fileUpdates, opts, integration.dir, opts.rootDir);

  if ((globalThis as any).codemod) {
    await updateViteConfigs(fileUpdates, integration, opts.rootDir);
  }

  const commit = async (showSpinner?: boolean) => {
    const isInstallingDeps = Object.keys(fileUpdates.installedDeps).length > 0;
    const spinner = showSpinner
      ? startSpinner(`Updating app${isInstallingDeps ? ' and installing dependencies' : ''}...`)
      : null;
    try {
      const dirs = new Set(fileUpdates.files.map((f) => dirname(f.path)));
      for (const dir of Array.from(dirs)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
          //
        }
      }

      const fsWrites = Promise.all(
        fileUpdates.files.map(async (f) => {
          await fs.promises.writeFile(f.path, f.content);
        })
      );

      if (opts.installDeps && Object.keys(fileUpdates.installedDeps).length > 0) {
        const pkgManager = getPackageManager();
        const { install } = installDeps(pkgManager, opts.rootDir);
        await install;
      }

      await fsWrites;
      spinner && spinner.succeed();
    } catch (e) {
      spinner && spinner.fail();
      panic(String(e));
    }
  };

  const result: UpdateAppResult = {
    rootDir: opts.rootDir,
    integration,
    updates: fileUpdates,
    commit,
  };
  return result;
}

async function mergeIntegrationDir(
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
    destContent += '\n\n' + srcContent;
    type = 'modify';
  } catch (e) {
    destContent = srcContent;
    type = 'create';
  }

  const pkgManager = getPackageManager();
  if (pkgManager === 'yarn') {
    destContent = destContent.replace(/npm run/g, 'yarn');
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

async function updateViteConfigs(
  fileUpdates: FsUpdates,
  integration: IntegrationData,
  rootDir: string
) {
  try {
    const viteConfig = integration.pkgJson.__qwik__?.viteConfig;
    if (viteConfig) {
      const viteConfigPath = join(rootDir, 'vite.config.ts');
      const destContent = await fs.promises.readFile(viteConfigPath, 'utf-8');

      const ts = (await import('typescript')).default;
      let updatedContent = updateViteConfig(ts, destContent, viteConfig);

      if (updatedContent) {
        try {
          const prettier = (await import('prettier')).default;

          let prettierOpts: Options = {
            filepath: viteConfigPath,
          };

          const opts = await prettier.resolveConfig(viteConfigPath);
          if (opts) {
            prettierOpts = { ...opts, ...prettierOpts };
          }

          updatedContent = prettier.format(updatedContent, prettierOpts);

          updatedContent = updatedContent.replace(`export default`, `\nexport default`);
        } catch (e) {
          console.error(e);
        }

        fileUpdates.files.push({
          path: viteConfigPath,
          content: updatedContent,
          type: 'modify',
        });
      }
    }
  } catch (e) {
    panic(String(e));
  }
}
