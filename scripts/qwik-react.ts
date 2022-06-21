import { BuildConfig, copyFile, mkdir, panic, readdir, stat } from './util';
import { join } from 'path';
import { execa } from 'execa';

const PACKAGE = 'qwik-react';

export async function buildQwikReact(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);

  const result = await execa('yarn', ['build'], {
    stdout: 'inherit',
    cwd: input,
  });

  if (result.failed) {
    panic(`tsc failed`);
  }
  await copyDir(
    config,
    join(config.dtsDir, 'packages', 'qwik-react', 'src'),
    join(input, 'lib', 'types')
  );
  console.log(`⚛️  ${PACKAGE}`);
}

async function copyDir(config: BuildConfig, srcDir: string, destDir: string) {
  await mkdir(destDir);
  const items = await readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE[itemName] && !itemName.includes('.test')) {
        const srcPath = join(srcDir, itemName);
        const destPath = join(destDir, itemName);
        const itemStat = await stat(srcPath);
        if (itemStat.isDirectory()) {
          await copyDir(config, srcPath, destPath);
        } else if (itemStat.isFile()) {
          await copyFile(srcPath, destPath);
        }
      }
    })
  );
}

const IGNORE: { [path: string]: boolean } = {
  '.rollup.cache': true,
  build: true,
  server: true,
  e2e: true,
  node_modules: true,
  'package-lock.json': true,
  'starter.tsconfig.json': true,
  'tsconfig.tsbuildinfo': true,
  'yarn.lock': true,
};
