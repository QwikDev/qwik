import { createApp, runCreateCli } from './create-app';
import { panic } from '../qwik/src/cli/utils/utils';
import { runCreateInteractiveCli } from './create-interactive';

export async function runCli() {
  try {
    const args = process.argv.slice(2);

    if (args.length >= 2) {
      // npm create qwik [starterId] [projectName]
      await runCreateCli(args[0], args[1]);
    } else {
      // npm create qwik
      await runCreateInteractiveCli();
    }
  } catch (e: any) {
    panic(e.message || e);
  }
}

export { createApp, runCreateCli, runCreateInteractiveCli };
