/* eslint-disable no-console */
import color from 'kleur';
import { loadTemplates } from '../utils/templates';
import { pmRunCmd } from '../utils/utils';

export async function printNewHelp() {
  const pmRun = pmRunCmd();
  const templates = await loadTemplates();

  console.log(``);
  console.log(`${color.cyan('Interactive')}`);
  console.log(`  ${pmRun} qwik ${color.magenta(`new --[template] ...`)}`);
  console.log(``);
  console.log(`${color.cyan('Complete command')}`);
  console.log(`  ${pmRun} qwik ${color.magenta(`new component [name] --[template] ...`)}`);
  console.log(`  ${pmRun} qwik ${color.magenta(`new route [name] --[template] ...`)}`);
  console.log(``);

  console.log(`  ${color.cyan('Templates')}`);
  for (const t of templates) {
    // ignore the default qwik component/route template
    if (t.id === 'qwik') {
      continue;
    }

    console.log(`    ${t.id}`);
  }
  console.log(``);
}
