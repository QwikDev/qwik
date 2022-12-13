/* eslint-disable no-console */
import color from 'kleur';
import { pmRunCmd } from '../utils/utils';

export async function printNewHelp() {
  const pmRun = pmRunCmd();

  console.log(``);
  console.log(`${pmRun} qwik ${color.magenta(`new component`)}`);
  console.log(`${pmRun} qwik ${color.magenta(`new route`)}`);
  console.log(``);
}
