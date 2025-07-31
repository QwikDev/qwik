import {
  accessSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPackageJson, writePackageJson } from './package-json';

import assert from 'assert';
import { panic } from './util';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function validateCreateQwikCli() {
  console.log(`👾 validating create-qwik...`);

  const cliDir = join(__dirname, '..', 'packages', 'create-qwik');
  accessSync(cliDir);

  const cliBin = join(cliDir, 'create-qwik.cjs');
  accessSync(cliBin);

  const cliPkgJsonPath = join(cliDir, 'package.json');
  const cliPkgJson = JSON.parse(readFileSync(cliPkgJsonPath, 'utf-8'));
  assert.strictEqual(cliPkgJson.name, 'create-qwik');
  const qwikVersion = cliPkgJson.version;

  const startersDir = join(cliDir, 'dist', 'starters');
  accessSync(startersDir);

  const appsDir = join(startersDir, 'apps');
  accessSync(appsDir);

  const cliApi = join(cliDir, 'dist', 'index.cjs');
  console.log(`💫 import cli api: ${cliApi}`);
  const api: typeof import('create-qwik') = await import(pathToFileURL(cliApi).href);

  const tmpDir = join(__dirname, '..', 'dist-dev');

  await Promise.all([
    validateStarter(api, tmpDir, 'playground', true, `👻`, qwikVersion),
    validateStarter(api, tmpDir, 'empty', true, `🫙`, qwikVersion),
    validateStarter(api, tmpDir, 'library', false, `📚`, qwikVersion),
  ]).catch((e) => {
    console.error(e);
    panic(String(e));
  });

  console.log(`👽 create-qwik validated\n`);
}

async function validateStarter(
  api: typeof import('create-qwik'),
  distDir: string,
  starterId: string,
  app: boolean,
  emoji: string,
  qwikVersion: string
) {
  const appDir = join(distDir, 'e2e-' + starterId);

  console.log(`${emoji} ${appDir}`);
  rmSync(appDir, { force: true, recursive: true });

  const result = await api.createApp({
    starterId,
    outDir: appDir,
  });

  assert.strictEqual(result.starterId, starterId);
  assert.strictEqual(result.outDir, appDir);

  accessSync(result.outDir);

  const appPkgJsonPath = join(result.outDir, 'package.json');
  const appPkgJson = JSON.parse(readFileSync(appPkgJsonPath, 'utf-8'));

  assertRightQwikDepsVersions(appPkgJson, qwikVersion, starterId);

  // Ensure that npm will use an existing version
  appPkgJson.devDependencies['@qwik.dev/core'] = 'latest';
  appPkgJson.devDependencies['@qwik.dev/router'] = 'latest';
  appPkgJson.devDependencies['eslint-plugin-qwik'] = 'latest';
  appPkgJson.devDependencies['eslint'] = 'latest';
  writeFileSync(appPkgJsonPath, JSON.stringify(appPkgJson, null, 2));

  const tsconfigPath = join(result.outDir, 'tsconfig.json');
  accessSync(tsconfigPath);

  const { execa } = await import('execa');
  console.log(`${emoji} ${starterId}: npm install`);
  await execa('npm', ['install'], { cwd: appDir, stdout: 'inherit' });

  console.log(`${emoji} ${starterId} validated\n`);
}

function assertRightQwikDepsVersions(appPkgJson: any, qwikVersion: string, starterType: string) {
  assert.strictEqual(
    appPkgJson.devDependencies['@qwik.dev/core'].includes(qwikVersion),
    true,
    `Qwik version mismatch for "${starterType}" starter`
  );
  if (appPkgJson.devDependencies.hasOwnProperty('@qwik.dev/router')) {
    assert.strictEqual(
      appPkgJson.devDependencies['@qwik.dev/router'].includes(qwikVersion),
      true,
      `Qwik Router version mismatch for "${starterType}" starter`
    );
  }
  if (appPkgJson.devDependencies.hasOwnProperty('eslint-plugin-qwik')) {
    assert.strictEqual(
      appPkgJson.devDependencies['eslint-plugin-qwik'].includes(qwikVersion),
      true,
      `ESlint plugin version mismatch for "${starterType}" starter`
    );
  }
}

function cpSync(src: string, dest: string) {
  // cpSync() not available until Node v16.7.0
  try {
    const stats = statSync(src);
    if (stats.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      readdirSync(src).forEach((childItem) => {
        const childSrc = join(src, childItem);
        const childDest = join(dest, childItem);
        cpSync(childSrc, childDest);
      });
    } else {
      copyFileSync(src, dest);
    }
  } catch (e) {}
}

async function copyLocalQwikDistToTestApp(appDir: string) {
  const srcQwikDir = join(__dirname, '..', 'packages', 'qwik');
  const destQwikDir = join(appDir, 'node_modules', '@qwik.dev', 'core');
  const srcQwikRouterDir = join(__dirname, '..', 'packages', 'qwik-router');
  const destQwikRouterDir = join(appDir, 'node_modules', '@qwik.dev', 'router');
  const destQwikBin = relative(appDir, join(destQwikDir, 'qwik.cjs'));

  if (existsSync(appDir) && existsSync(srcQwikDir) && existsSync(srcQwikRouterDir)) {
    console.log('\nqwik-app local development updates:');

    rmSync(destQwikDir, { recursive: true, force: true });
    cpSync(srcQwikDir, destQwikDir);
    console.log(
      ` - Copied "${relative(process.cwd(), srcQwikDir)}" to "${relative(
        process.cwd(),
        destQwikDir
      )}"`
    );

    rmSync(destQwikRouterDir, { recursive: true, force: true });
    cpSync(srcQwikRouterDir, destQwikRouterDir);
    console.log(
      ` - Copied "${relative(process.cwd(), srcQwikRouterDir)}" to "${relative(
        process.cwd(),
        destQwikRouterDir
      )}"`
    );

    const appPackageJson = await readPackageJson(appDir);
    appPackageJson.scripts!.qwik = `node ./${destQwikBin}`;
    await writePackageJson(appDir, appPackageJson);
    console.log(
      ` - Updated ${relative(process.cwd(), appDir)} package.json qwik script to "${
        appPackageJson.scripts!.qwik
      }"`
    );

    console.log('');
  }
}

(async () => {
  try {
    if (process.argv.includes('--copy-local-qwik-dist')) {
      const appDir = join(__dirname, '..', 'qwik-app');
      await copyLocalQwikDistToTestApp(appDir);
    } else {
      await validateCreateQwikCli();
    }
  } catch (e) {
    console.error('❌', e);
    process.exit(1);
  }
})();
