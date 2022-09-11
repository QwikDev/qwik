import type { AppCommand } from '../utils/app-command';
import { execa, ExecaChildProcess } from 'execa';
import { readdirSync } from 'fs';
import { join } from 'path';

export async function runBuildCommand(app: AppCommand) {
  const srcFileNames = readdirSync(app.srcDir);

  const qwikBuildId = Date.now() + Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .toLowerCase();

  const b1: ExecaChildProcess<string>[] = [];
  
  const typecheck = execa('tsc', ['--incremental', '--noEmit'], {
    stdio: 'inherit',
  });
  b1.push(typecheck);

  const clientBuild = execa('vite', ['build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      qwikBuildId
    }
  });
  b1.push(clientBuild);

  await Promise.all(b1);
  
  const b2: ExecaChildProcess<string>[] = [];

  for (const srcFileName of srcFileNames) {
    if (srcFileName === 'entry.server.tsx' || srcFileName === 'entry.static.tsx') {
      const extPath = join(app.srcDir, srcFileName);
      const build = execa('vite', ['build', '--ssr', extPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          qwikBuildId
        }
      });
      b2.push(build);
    }
  }

  await Promise.all(b2);
}
