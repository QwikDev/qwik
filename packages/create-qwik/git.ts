import { log } from '@clack/prompts';
import { execSync, spawn, type SpawnOptions } from 'child_process';

export async function initializeGitRepo(directory: string, logOnSuccess: boolean): Promise<void> {
  try {
    const result = await _initializeGitRepo(directory);
    if (logOnSuccess) {
      log[result.success ? 'step' : 'info'](result.message);
    }
  } catch (error: any) {
    log.error(`Could not initialize git repository.`);
    log.error(error.toString());
  }
}

async function _initializeGitRepo(
  directory: string
): Promise<{ success: boolean; message: string }> {
  const execute = (args: ReadonlyArray<string>) => {
    const spawnOptions: SpawnOptions = {
      stdio: 'ignore',
      shell: true,
      cwd: directory,
    };
    return new Promise<void>((resolve, reject) => {
      spawn('git', args, spawnOptions).on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(code);
        }
      });
    });
  };
  const gitVersion = checkGitVersion();
  if (!gitVersion) {
    return {
      success: false,
      message: 'Could not find the installed version of git. Skipping initialization.',
    };
  }
  const insideRepo = await execute(['rev-parse', '--is-inside-work-tree']).then(
    () => true,
    () => false
  );
  if (insideRepo) {
    return {
      success: false,
      message: 'Directory is already under version control. Skipping initialization of git.',
    };
  }
  const defaultBase = deduceDefaultBase();
  const [gitMajor, gitMinor] = gitVersion.split('.');

  if (+gitMajor > 2 || (+gitMajor === 2 && +gitMinor >= 28)) {
    await execute(['init', '-b', defaultBase]);
  } else {
    await execute(['init']);
    await execute(['checkout', '-b', defaultBase]); // Git < 2.28 doesn't support -b on git init.
  }
  await execute(['add', '.']);
  const message = 'initial commit';
  await execute(['commit', `-m "${message}"`]);
  return {
    success: true,
    message: 'Successfully initialized git.',
  };
}

function checkGitVersion(): string | null {
  try {
    const gitVersionOutput = execSync('git --version').toString().trim();
    return gitVersionOutput.match(/[0-9]+\.[0-9]+\.+[0-9]+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

function deduceDefaultBase(): string {
  const defaultBase = 'main';
  try {
    return execSync('git config --get init.defaultBranch').toString().trim() || defaultBase;
  } catch {
    return defaultBase;
  }
}
