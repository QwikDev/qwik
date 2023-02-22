/* eslint-disable no-console */
import { createApp, runCreateCli } from './create-app';
import { panic } from '../qwik/src/cli/utils/utils';
import { runCreateInteractiveCli } from './create-interactive';
import color from 'kleur';

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
      color.red(
        `Qwik requires Node.js 16.8 or higher. You are currently running Node.js ${version}.`
      )
    );
    process.exit(1);
  } else if (Number(majorVersion) === 16) {
    if (Number(minorVersion) < 8) {
      console.warn(
        color.yellow(
          `Node.js 16.8 or higher is recommended. You are currently running Node.js ${version}.`
        )
      );
    }
  }
}

function printHeader() {
  // const qwikGradient = gradient(["rgb(24, 182, 246)", "rgb(172, 127, 244)"]);
  console.log(
    color.blue(`
      ${color.magenta('............')}
    .::: ${color.magenta(':--------:.')}
   .::::  ${color.magenta('.:-------:.')}
  .:::::.   ${color.magenta('.:-------.')}
  ::::::.     ${color.magenta('.:------.')}
 ::::::.        ${color.magenta(':-----:')}
 ::::::.       ${color.magenta('.:-----.')}
  :::::::.     ${color.magenta('.-----.')}
   ::::::::..   ${color.magenta('---:.')}
    .:::::::::. ${color.magenta(':-:.')}
     ..::::::::::::
             ...::::
    `),
    '\n'
  );
}

export { createApp, runCreateCli, runCreateInteractiveCli };
