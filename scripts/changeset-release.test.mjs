import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('publishes each package in only its intended tag pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'qwik-release-'));
  const script = join(dirname(fileURLToPath(import.meta.url)), 'changeset-release.mjs');
  const manifests = {
    'packages/qwik/package.json': { name: '@qwik.dev/core', version: '2.0.0-beta.45' },
    'packages/mcp/package.json': { name: '@qwik.dev/mcp', version: '2.0.0-beta.45' },
    'packages/create-qwik/package.json': { name: 'create-qwik', version: '2.0.0-beta.45' },
    'packages/eslint-plugin-qwik/package.json': {
      name: 'eslint-plugin-qwik',
      version: '2.0.0-beta.45',
    },
    'packages/supabase-auth-helpers-qwik/package.json': {
      name: 'supabase-auth-helpers-qwik',
      version: '0.0.4-beta.0',
    },
  };

  try {
    for (const [path, manifest] of Object.entries(manifests)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(manifest));
    }
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const fakePnpm = join(bin, 'pnpm');
    writeFileSync(
      fakePnpm,
      `#!/usr/bin/env node
const fs = require('node:fs');
const tag = process.argv.at(-1);
const read = (name) => JSON.parse(fs.readFileSync('packages/' + name + '/package.json'));
const core = read('qwik');
const mcp = read('mcp');
const cli = read('create-qwik');
if (tag === 'latest' && !core.private && !mcp.private && cli.private) process.exit(0);
if (tag === 'beta' && core.private && mcp.private && !cli.private) process.exit(0);
process.exit(1);
`,
    );
    chmodSync(fakePnpm, 0o755);

    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    delete env.RELEASE_DRY_RUN;
    execFileSync(process.execPath, [script], { cwd: root, env });
    for (const [path, manifest] of Object.entries(manifests)) {
      assert.deepEqual(JSON.parse(readFileSync(join(root, path), 'utf8')), manifest);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
