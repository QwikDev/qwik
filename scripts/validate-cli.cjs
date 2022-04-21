const { accessSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } = require('fs');
const assert = require('assert');
const { join } = require('path');

async function validateCreateQwikCli() {
  console.log(`👾 validating create-qwik...`);

  const distDevDir = join(__dirname, '..', 'dist-dev');
  const distQwik = join(distDevDir, '@builder.io-qwik');

  const cliDir = join(distDevDir, 'create-qwik');
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

  const outDir = join(distDevDir, 'my-todo-app');
  console.log(`🕵️‍♂️ creating app [todo/express]: ${outDir}`);
  rmSync(outDir, { force: true, recursive: true });

  const expressResult = await api.generateStarter({
    projectName: 'My ToDo App',
    appId: 'todo',
    serverId: 'express',
    outDir: outDir,
    featureIds: [],
  });

  assert.strictEqual(expressResult.projectName, 'My ToDo App');
  assert.strictEqual(expressResult.appId, 'todo');
  assert.strictEqual(expressResult.serverId, 'express');
  assert.strictEqual(expressResult.outDir, outDir);

  accessSync(expressResult.outDir);

  const appPkgJsonPath = join(expressResult.outDir, 'package.json');
  const appPkgJson = JSON.parse(readFileSync(appPkgJsonPath, 'utf-8'));
  assert.strictEqual(appPkgJson.name, 'my-todo-app');

  appPkgJson.devDependencies['@builder.io/qwik'] = 'latest';
  writeFileSync(appPkgJsonPath, JSON.stringify(appPkgJson, null, 2));

  const tsconfigPath = join(expressResult.outDir, 'tsconfig.json');
  accessSync(tsconfigPath);

  const { execa } = await import('execa');
  console.log(`🕵️‍♂️ npm install [todo/express]`);
  await execa('npm', ['install'], { cwd: outDir, stdout: 'inherit' });

  console.log(`🌟 copy @builder.io/qwik dist [todo/express]`);
  const qwikNodeModule = join(outDir, 'node_modules', '@builder.io', 'qwik');
  rmSync(qwikNodeModule, { force: true, recursive: true });
  cpSync(distQwik, qwikNodeModule, { recursive: true });

  console.log(`🌈 npm run build [todo/express]`);
  await execa('npm', ['run', 'build'], { cwd: outDir, stdout: 'inherit' });

  console.log(`👽 create-qwik validated\n`);
}

validateCreateQwikCli();
