const {
  accessSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} = require('fs');
const assert = require('assert');
const { join } = require('path');
const { pathToFileURL } = require('url');

async function validateCreateQwikCli() {
  console.log(`👾 validating create-qwik...`);

  const distDir = join(__dirname, '..', 'dist-dev');
  const cliDir = join(distDir, 'create-qwik');
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
  const api = require(cliApi);

  const starters = await api.getStarters();
  assert.ok(starters.apps.length > 0);
  assert.ok(starters.servers.length > 0);
  assert.ok(starters.features.length > 0);

  await validateStarter(api, distDir, 'starter', 'express');
  await validateStarter(api, distDir, 'starter-builder', 'cloudflare-pages');
  await validateStarter(api, distDir, 'starter-partytown', 'express');
  await validateStarter(api, distDir, 'todo', 'cloudflare-pages');

  console.log(`👽 create-qwik validated\n`);
}

async function validateStarter(api, distDir, appId, serverId) {
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

  const distQwik = join(__dirname, '..', 'dist-dev', '@builder.io-qwik');
  cpSync(distQwik, qwikNodeModule, { recursive: true });

  console.log(`🌈 ${projectName}: npm run build`);
  await execa('npm', ['run', 'build'], { cwd: appDir, stdout: 'inherit' });

  accessSync(join(appDir, '.vscode'));
  accessSync(join(appDir, 'dist', 'favicon.ico'));
  accessSync(join(appDir, 'dist', 'symbols-manifest.json'));
  accessSync(join(appDir, 'dist', 'build'));
  accessSync(join(appDir, 'server', 'entry.server.js'));
  accessSync(join(appDir, 'server', 'favicon.ico'));
  accessSync(join(appDir, 'README.md'));
  accessSync(join(appDir, 'tsconfig.json'));
  accessSync(join(appDir, 'tsconfig.tsbuildinfo'));

  // pathToFileURL() required for windows
  const importUrl = pathToFileURL(join(appDir, 'server', 'entry.server.js'));
  console.log(`👑 ${projectName} import("${importUrl}")`);

  const { render } = await import(importUrl);
  const ssrResult = await render();
  assert.ok(typeof ssrResult.html === 'string');

  console.log(`⭐️ ${projectName} validated\n`);
}

function cpSync(src, dest) {
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
