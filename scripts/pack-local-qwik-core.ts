import { execFileSync } from 'node:child_process';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execa } from 'execa';
import { readPackageJson, writePackageJson } from './package-json.ts';
import { ensureDir } from './util.ts';

const rootDir = join(import.meta.dirname, '..');
const qwikDir = join(rootDir, 'packages', 'qwik');
const optimizerDir = join(rootDir, 'packages', 'optimizer');
const packDir = join(rootDir, 'dist-dev', 'local-qwik-pack');
const OPTIMIZER_PACKAGE = '@qwik.dev/optimizer';

async function main() {
  await rm(packDir, { recursive: true, force: true });
  ensureDir(packDir);

  const originalOptimizerPkg = await readPackageJson(optimizerDir);
  const originalQwikPkg = await readPackageJson(qwikDir);
  const localOptimizerVersion = createLocalVersion(originalOptimizerPkg.version);

  try {
    await writePackageJson(optimizerDir, {
      ...originalOptimizerPkg,
      version: localOptimizerVersion,
    });

    await execa('pnpm', ['--dir', optimizerDir, 'pack', '--pack-destination', packDir], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    const optimizerTarball = await getNewestTarball(packDir);
    const optimizerDependency = toFileDependency(optimizerTarball);

    await writePackageJson(qwikDir, {
      ...originalQwikPkg,
      dependencies: {
        ...originalQwikPkg.dependencies,
        [OPTIMIZER_PACKAGE]: optimizerDependency,
      },
    });

    await execa('pnpm', ['--dir', qwikDir, 'pack', '--pack-destination', packDir], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    const coreTarball = await getNewestTarball(packDir);
    console.log('');
    console.log(`Packed local optimizer: ${optimizerTarball}`);
    console.log(`Packed local core: ${coreTarball}`);
    console.log('');
    console.log('Install the core tarball in an external project to get this local optimizer too:');
    console.log(`pnpm add ${coreTarball}`);
  } finally {
    await writePackageJson(qwikDir, originalQwikPkg);
    await writePackageJson(optimizerDir, originalOptimizerPkg);
  }
}

function createLocalVersion(version: string) {
  const baseVersion = version.replace(/\+.*/, '');
  const cleanSha =
    getShortSha()
      .replace(/[^0-9A-Za-z-]/g, '')
      .slice(0, 12) || 'local';
  return `${baseVersion}-local.${cleanSha}`;
}

function getShortSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return String(Date.now());
  }
}

function toFileDependency(filePath: string) {
  return `file:${resolve(filePath).replace(/\\/g, '/')}`;
}

async function getNewestTarball(dir: string) {
  const tarballs = (await readdir(dir)).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length === 0) {
    throw new Error(`No package tarball found in ${dir}.`);
  }

  const sorted = await Promise.all(
    tarballs.map(async (file) => {
      const path = join(dir, file);
      return { path, mtimeMs: (await stat(path)).mtimeMs };
    })
  );
  sorted.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sorted[0].path;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
