/* eslint-disable no-console */
import color from 'kleur';
import { relative } from 'path';
import type { GenerateResult } from '../types';

export function logResult(result: GenerateResult) {
  const isCwdDir = process.cwd() === result.outDir;
  const relativeProjectPath = relative(process.cwd(), result.outDir);
  console.log(``);

  if (isCwdDir) {
    console.log(`⭐️ ${color.green(`Success!`)}`);
  } else {
    console.log(
      `⭐️ ${color.green(`Success! Project saved in`)} ${color.yellow(
        relativeProjectPath
      )} ${color.green(`directory`)}`
    );
  }

  console.log(``);

  console.log(`🤖 ${color.cyan(`Next steps:`)}`);
  if (!isCwdDir) {
    console.log(`   cd ${relativeProjectPath}`);
  }
  console.log(`   npm install`);
  console.log(`   npm start`);
  console.log(``);
  console.log(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  console.log(`   https://qwik.builder.io/chat`);
  console.log(`   https://twitter.com/QwikDev`);
  console.log(``);
}

export function panic(msg: string) {
  console.error(`\n❌ ${color.red(msg)}\n`);
  process.exit(1);
}
