import {
  accessSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from 'fs';
import assert from 'assert';
import { join } from 'path';
import { pathToFileURL } from 'url';

async function validateCreateQwikCli() {
  console.log(`👾 validating create-qwik...`);

  const cliDir = join(__dirname, '..', 'packages', 'create-qwik', 'dist');
  accessSync(cliDir);

  const cliBin = join(cliDir, 'create-qwik');
  accessSync(cliBin);

  const cliPkgJsonPath = join(cliDir, 'package.json');
  const cliPkgJson = JSON.parse(readFileSync(cliPkgJsonPath, 'utf-8'));
  assert.strictEqual(cliPkgJson.name, 'create-qwik');

  const startersDir = join(cliDir, 'starters');
  accessSync(startersDir);

  const appsDir = join(startersDir, 'apps');
  accessSync(appsDir);

  const serversDir = join(startersDir, 'servers');
  accessSync(serversDir);

  const featuresDir = join(startersDir, 'features');
  accessSync(featuresDir);

  const cliApi = join(cliDir, 'index.js');
  console.log(`💫 import cli api: ${cliApi}`);
  const api: typeof import('create-qwik') = await import(pathToFileURL(cliApi).href);

  const starters = await api.getStarters();
  assert.ok(starters.apps.length > 0);
  assert.ok(starters.servers.length > 0);
  assert.ok(starters.features.length > 0);

  const tmpDir = join(__dirname, '..', 'dist-dev');
  await validateStarter(api, tmpDir, 'blank', '', true);
  await validateStarter(api, tmpDir, 'library', '', false);
  await validateStarter(api, tmpDir, 'qwik-city', 'express', true);

  console.log(`👽 create-qwik validated\n`);
}

async function validateStarter(
  api: typeof import('create-qwik'),
  distDir: string,
  appId: string,
  serverId: string,
  app: boolean
) {
  const projectName = `${appId}-${serverId}`;
  const appDir = join(distDir, 'app-' + projectName);

  console.log(`\n------------------------------------\n`);
  console.log(`🌎 ${projectName}: ${appDir}`);
  rmSync(appDir, { force: true, recursive: true });

  const result = await api.generateStarter({
    projectName,
    appId,
    serverId,
    outDir: appDir,
    featureIds: [],
  });

  assert.strictEqual(result.projectName, projectName);
  assert.strictEqual(result.appId, appId);
  assert.strictEqual(result.serverId, serverId);
  assert.strictEqual(result.outDir, appDir);

  accessSync(result.outDir);

  const appPkgJsonPath = join(result.outDir, 'package.json');
  const appPkgJson = JSON.parse(readFileSync(appPkgJsonPath, 'utf-8'));
  assert.strictEqual(appPkgJson.name, projectName.toLowerCase());

  appPkgJson.devDependencies['@builder.io/qwik'] = 'latest';
  writeFileSync(appPkgJsonPath, JSON.stringify(appPkgJson, null, 2));

  const tsconfigPath = join(result.outDir, 'tsconfig.json');
  accessSync(tsconfigPath);

  const { execa } = await import('execa');
  console.log(`💥 ${projectName}: npm install`);
  await execa('npm', ['install'], { cwd: appDir, stdout: 'inherit' });

  console.log(`🌟 ${projectName}: copy @builder.io/qwik distribution`);
  const qwikNodeModule = join(appDir, 'node_modules', '@builder.io', 'qwik');
  rmSync(qwikNodeModule, { force: true, recursive: true });
  const distQwik = join(__dirname, '..', 'packages', 'qwik', 'dist');
  cpSync(distQwik, qwikNodeModule);

  console.log(`🌟 ${projectName}: copy eslint-plugin-qwik distribution`);
  const eslintNodeModule = join(appDir, 'node_modules', 'eslint-plugin-qwik');
  rmSync(eslintNodeModule, { force: true, recursive: true });
  const distEslintQwik = join(__dirname, '..', 'packages', 'eslint-plugin-qwik', 'dist');
  cpSync(distEslintQwik, eslintNodeModule);

  console.log(`🌈 ${projectName}: npm run build`);
  await execa('npm', ['run', 'build'], { cwd: appDir, stdout: 'inherit' });

  console.log(`🌈 ${projectName}: npm run lint`);
  await execa('npm', ['run', 'lint'], { cwd: appDir, stdout: 'inherit' });

  accessSync(join(appDir, '.vscode'));
  if (app) {
    accessSync(join(appDir, 'dist', 'favicon.ico'));
    accessSync(join(appDir, 'dist', 'q-manifest.json'));
    accessSync(join(appDir, 'dist', 'build'));
    const serverDir = join(appDir, 'server');
    accessSync(serverDir);

    let hasEntryServer = false;
    const serverOutput = readdirSync(serverDir);
    for (const serverFileName of serverOutput) {
      if (serverFileName.startsWith('entry.')) {
        hasEntryServer = true;
        break;
      }
    }

    if (!hasEntryServer) {
      throw new Error(`"${projectName}", ${appDir} did not generate server output`);
    }
    if (!serverOutput) {
      throw new Error(`"${projectName}", ${appDir} did not generate server output`);
    }
  } else {
    accessSync(join(appDir, 'lib', 'types'));
    accessSync(join(appDir, 'lib', 'index.es.qwik.js'));
    accessSync(join(appDir, 'lib', 'index.cjs.qwik.js'));
  }
  accessSync(join(appDir, 'README.md'));
  accessSync(join(appDir, 'tsconfig.json'));
  accessSync(join(appDir, 'tsconfig.tsbuildinfo'));

  console.log(`⭐️ ${projectName} validated\n`);
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

(async () => {
  try {
    await validateCreateQwikCli();
  } catch (e) {
    console.error('❌', e);
    process.exit(1);
  }
})();
