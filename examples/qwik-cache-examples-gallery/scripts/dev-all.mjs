import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');

const apps = [
  ['gallery', 'examples/qwik-cache-examples-gallery', 4300],
  ['commerce', 'examples/qwik-cache-commerce-app', 4311],
  ['dashboard', 'examples/qwik-cache-dashboard-app', 4312],
  ['partial-router', 'examples/qwik-partial-router-app', 4313],
  ['torture', 'examples/qwik-cache-torture-app', 4314],
  ['component-host', 'examples/qwik-component-host-app', 4315],
  ['small-cache', 'examples/qwik-cache-registry-app', 4321],
  ['qcomponent', 'examples/qwik-qcomponent-partials-app', 4322],
  ['partial-nav', 'examples/qwik-partial-navigation-app', 4323],
];

const children = apps.map(([name, dir, port]) => {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.ts',
      '--mode',
      'ssr',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: resolve(repoRoot, dir),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout.on('data', (chunk) => writeLines(name, chunk));
  child.stderr.on('data', (chunk) => writeLines(name, chunk));
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${name}] exited with ${signal ?? code}`);
    }
  });
  return child;
});

let shuttingDown = false;

console.log('');
console.log('Qwik cache-registry examples are starting:');
for (const [name, , port] of apps) {
  console.log(`  ${name.padEnd(16)} http://127.0.0.1:${port}/`);
}
console.log('');
console.log('Open the gallery at http://127.0.0.1:4300/');
console.log('Press Ctrl+C to stop all example servers.');
console.log('');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    for (const child of children) {
      child.kill(signal);
    }
    setTimeout(() => process.exit(0), 250);
  });
}

function writeLines(name, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) {
      console.log(`[${name}] ${line}`);
    }
  }
}
