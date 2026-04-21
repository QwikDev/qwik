import { execFileSync } from 'node:child_process';
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { readPackageJson, writePackageJson } from './package-json.ts';
import { ensureDir, type PackageJSON } from './util.ts';
import {
  OPTIMIZER_PACKAGE,
  getChangedFiles,
  getGithubRepository,
  getOptimizerChangedFiles,
  getPkgPrNewCommit,
} from './optimizer-change-utils.ts';

const rootDir = join(import.meta.dirname, '..');
const qwikDir = join(rootDir, 'packages', 'qwik');
const optimizerDir = join(rootDir, 'packages', 'optimizer');
const verifyDir = join(rootDir, 'dist-dev', 'pkg-pr-new-verify');
const packageDirs = [
  './packages/qwik',
  './packages/qwik-router',
  './packages/eslint-plugin-qwik',
  './packages/create-qwik',
  './packages/optimizer',
];

async function main() {
  const changedFiles = await getChangedFiles();
  const optimizerChangedFiles = getOptimizerChangedFiles(changedFiles);
  const optimizerChanged = optimizerChangedFiles.length > 0;
  const originalOptimizerPkg = await readPackageJson(optimizerDir);
  const originalQwikPkg = await readPackageJson(qwikDir);
  let expectedOptimizerVersion = originalOptimizerPkg.version;
  let expectedCoreOptimizerDependency = expectedOptimizerVersion;

  if (optimizerChanged) {
    const previewCommit = await getPkgPrNewCommit();
    expectedOptimizerVersion = createPreviewVersion(originalOptimizerPkg.version, previewCommit);
    expectedCoreOptimizerDependency = await getOptimizerPreviewUrl(previewCommit);
    await writePackageJson(optimizerDir, {
      ...originalOptimizerPkg,
      version: expectedOptimizerVersion,
    });
    await writePackageJson(qwikDir, {
      ...originalQwikPkg,
      dependencies: {
        ...originalQwikPkg.dependencies,
        [OPTIMIZER_PACKAGE]: expectedCoreOptimizerDependency,
      },
    });
    console.log(`${OPTIMIZER_PACKAGE} changed; using preview version ${expectedOptimizerVersion}.`);
    console.log(`Packed @qwik.dev/core will depend on ${expectedCoreOptimizerDependency}.`);
  } else {
    console.log(
      `${OPTIMIZER_PACKAGE} did not change; using ${expectedOptimizerVersion} for preview packages.`
    );
  }

  try {
    await verifyPackedCoreOptimizerDependency(expectedCoreOptimizerDependency);
    if (process.env.QWIK_PKG_PR_NEW_SKIP_PUBLISH === '1') {
      console.log('Skipping pkg.pr.new publish because QWIK_PKG_PR_NEW_SKIP_PUBLISH=1.');
      return;
    }
    await execa('pnpm', ['exec', 'pkg-pr-new', 'publish', '--pnpm', ...packageDirs], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } finally {
    if (optimizerChanged) {
      await writePackageJson(qwikDir, originalQwikPkg);
      await writePackageJson(optimizerDir, originalOptimizerPkg);
    }
  }
}

function createPreviewVersion(version: string, sha: string) {
  const baseVersion = version.replace(/\+.*/, '');
  const cleanSha = sha.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12) || 'local';
  return `${baseVersion}-dev.${cleanSha}`;
}

async function getOptimizerPreviewUrl(commitSha: string) {
  const repository = await getGithubRepository();
  const commit = commitSha.slice(0, 7);
  return `https://pkg.pr.new/${repository}/${OPTIMIZER_PACKAGE}@${commit}`;
}

async function verifyPackedCoreOptimizerDependency(expectedOptimizerDependency: string) {
  await rm(verifyDir, { recursive: true, force: true });
  ensureDir(verifyDir);

  await execa('pnpm', ['--dir', qwikDir, 'pack', '--pack-destination', verifyDir], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  const packedCore = await getNewestTarball(verifyDir);
  const manifest = readPackedPackageJson(packedCore);
  const actualOptimizerVersion = manifest.dependencies?.[OPTIMIZER_PACKAGE];

  if (actualOptimizerVersion !== expectedOptimizerDependency) {
    throw new Error(
      `Packed @qwik.dev/core depends on ${OPTIMIZER_PACKAGE}@${actualOptimizerVersion}, ` +
        `expected ${expectedOptimizerDependency}.`
    );
  }

  console.log(
    `Verified packed @qwik.dev/core depends on ` +
      `${OPTIMIZER_PACKAGE}@${expectedOptimizerDependency}.`
  );
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

function readPackedPackageJson(tarball: string): PackageJSON {
  const output = execFileSync('tar', ['-xOf', tarball, 'package/package.json'], {
    encoding: 'utf-8',
  });
  return JSON.parse(output) as PackageJSON;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
