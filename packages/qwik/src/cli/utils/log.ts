/* eslint-disable no-console */
import color from 'kleur';
import { relative } from 'path';
import type { CreateAppResult } from '../types';
import { getPackageManager } from './utils';

export function logCreateAppResult(result: CreateAppResult, ranInstall: boolean) {
  console.log(``);
  console.clear();

  const isCwdDir = process.cwd() === result.outDir;
  const relativeProjectPath = relative(process.cwd(), result.outDir);

  if (isCwdDir) {
    console.log(`⭐️ ${color.bgGreen(' Success! ')}`);
  } else {
    console.log(
      `⭐️ ${color.green(`${color.bgGreen(' Success! ')} Project saved in`)} ${color.yellow(
        relativeProjectPath
      )} ${color.green(`directory`)}`
    );
  }
  console.log(``);

  console.log(`🤖 ${color.cyan(`Next steps:`)}`);
  if (!isCwdDir) {
    console.log(`   cd ${relativeProjectPath}`);
  }
  const pkgManager = getPackageManager();
  if (!ranInstall) {
    console.log(`   ${pkgManager} install`);
  }
  console.log(`   ${pkgManager} start`);
  console.log(``);

  logSuccessFooter();
}

export function logSuccessFooter() {
  console.log(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  console.log(`   https://qwik.builder.io/chat`);
  console.log(`   https://twitter.com/QwikDev`);
  console.log(``);
}
