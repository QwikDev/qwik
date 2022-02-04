const { accessSync, readFileSync } = require('fs');
const assert = require('assert');
const { join } = require('path');

async function validateCreateQwikCli() {
  console.log(`👾 validating create-qwik...`);

  const distDevDir = join(__dirname, '..', 'dist-dev');

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
  const api = require(cliApi);
  const starters = await api.getStarters();
  assert.ok(starters.apps.length > 0);
  assert.ok(starters.servers.length > 0);
  assert.ok(starters.features.length > 0);

  const outDir = join(distDevDir, 'my-todo-app');
  const result = await api.generateStarter({
    projectName: 'My ToDo App',
    appId: 'todo',
    serverId: 'express',
    outDir: outDir,
    featureIds: [],
  });

  assert.strictEqual(result.projectName, 'My ToDo App');
  assert.strictEqual(result.appId, 'todo');
  assert.strictEqual(result.serverId, 'express');
  assert.strictEqual(result.outDir, outDir);

  accessSync(result.outDir);

  const appPkgJsonPath = join(result.outDir, 'package.json');
  const appPkgJson = JSON.parse(readFileSync(appPkgJsonPath, 'utf-8'));
  assert.strictEqual(appPkgJson.name, 'my-todo-app');

  const tsconfigPath = join(result.outDir, 'tsconfig.json');
  accessSync(tsconfigPath);

  console.log(`👽 create-qwik validated\n`);
}

validateCreateQwikCli();
