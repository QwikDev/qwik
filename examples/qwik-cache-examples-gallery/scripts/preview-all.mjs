import { spawn } from 'node:child_process';
import { apps, resolveAppDir } from './apps.mjs';

const children = apps.map(([name, dir, port]) => {
  const child = spawn(
    'pnpm',
    ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: resolveAppDir(dir),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
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
console.log('Qwik cache-registry production previews are starting:');
for (const [name, , port] of apps) {
  console.log(`  ${name.padEnd(16)} http://127.0.0.1:${port}/`);
}
console.log('');
console.log('Open the gallery at http://127.0.0.1:4300/');
console.log('Press Ctrl+C to stop all production preview servers.');
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
