import { runCommand } from './run';
import { AppCommand } from './app-command';
import { panic } from './utils';

export async function runCli() {
  try {
    const app = new AppCommand({
      rootDir: '',
      cwd: process.cwd(),
      args: process.argv.slice(2),
    });
    await runCommand(app);
  } catch (e) {
    panic(String(e));
  }
}

export { updateApp } from './update-app';
