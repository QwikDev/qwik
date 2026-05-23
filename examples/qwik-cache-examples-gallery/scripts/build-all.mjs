import { spawn } from 'node:child_process';
import { apps, resolveAppDir } from './apps.mjs';

for (const [name, dir] of apps) {
  const start = Date.now();
  console.log('');
  console.log(`[${name}] building production preview`);
  await runBuild(name, dir);
  console.log(`[${name}] built in ${formatMs(Date.now() - start)}`);
}

console.log('');
console.log('All Qwik cache-registry examples built for production preview.');

function runBuild(name, dir) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'qwik', 'build', 'preview'], {
      cwd: resolveAppDir(dir),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });

    child.stdout.on('data', (chunk) => writeLines(name, chunk));
    child.stderr.on('data', (chunk) => writeLines(name, chunk));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`[${name}] production build failed with ${signal ?? code}`));
      }
    });
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

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
