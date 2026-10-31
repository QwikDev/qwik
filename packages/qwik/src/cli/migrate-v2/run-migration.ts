import spawn from 'cross-spawn';
import detectPackageManager from 'which-pm-runs';

/** The migration ships with v2, so it always matches the latest v2 release. */
export function runV2Migration() {
  const [cmd, ...args] = getRunner();
  const child = spawn(cmd, [...args, '@qwik.dev/core@latest', 'migrate-v2'], {
    stdio: 'inherit',
  });
  return new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`migrate-v2 exited with code ${code}`));
      }
    });
  });
}

/** Uses the project's package manager so the migration installs with it too. */
function getRunner() {
  const pm = detectPackageManager();
  if (pm?.name === 'pnpm') {
    return ['pnpm', 'dlx'];
  }
  if (pm?.name === 'bun') {
    return ['bunx'];
  }
  // yarn 1 has no dlx
  if (pm?.name === 'yarn' && !pm.version.startsWith('1.')) {
    return ['yarn', 'dlx'];
  }
  return ['npx', '-y'];
}
