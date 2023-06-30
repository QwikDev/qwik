/* eslint-disable no-console */
import { createApp, runCreateCli } from './create-app';
import { panic, printHeader } from '../qwik/src/cli/utils/utils';
import { runCreateInteractiveCli } from './create-interactive';
import { red, yellow } from 'kleur/colors';

export async function runCli() {
  console.clear();

  printHeader();

  checkNodeVersion();

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

function checkNodeVersion() {
  const version = process.version;
  const [majorVersion, minorVersion] = version.replace('v', '').split('.');
  if (Number(majorVersion) < 16) {
    console.error(
      red(`Qwik requires Node.js 16.8 or higher. You are currently running Node.js ${version}.`)
    );
    process.exit(1);
  } else if (Number(majorVersion) === 16) {
    if (Number(minorVersion) < 8) {
      console.warn(
        yellow(
          `Node.js 16.8 or higher is recommended. You are currently running Node.js ${version}.`
        )
      );
    }
  } else if (Number(majorVersion) === 18) {
    if (Number(minorVersion) < 11) {
      console.error(
        red(
          `Node.js 18.11 or higher is REQUIRED. From Node 18.0.0 to 18.11.0, there is a bug preventing correct behaviour of Qwik. You are currently running Node.js ${version}. https://github.com/BuilderIO/qwik/issues/3035`
        )
      );
    }
  }
}

export { createApp, runCreateCli, runCreateInteractiveCli };
