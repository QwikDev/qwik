/* eslint-disable no-console */
import color from 'kleur';
import { pmRunCmd } from '../utils/utils';

export async function printEnableHelp() {
  const pmRun = pmRunCmd();

  console.log(``);
  console.log(`${pmRun} qwik ${color.magenta(`enable templates`)}`);
  console.log(``);
}
