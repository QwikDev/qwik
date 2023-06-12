import { cyan, magenta, gray } from 'kleur/colors';
import { loadTemplates } from '../utils/templates';
import { pmRunCmd, note } from '../utils/utils';
import { POSSIBLE_TYPES } from './utils';

export async function printNewHelp() {
  const pmRun = pmRunCmd();
  const templates = await loadTemplates();

  const outString = [];
  outString.push(`${cyan('Interactive')}`);
  outString.push(`  ${pmRun} qwik ${magenta(`new --[template] ...`)}`);
  outString.push(``);

  outString.push(`${cyan('Complete command')}`);
  outString.push(`  ${pmRun} qwik ${magenta(`new [type] [name] --[template] ...`)}`);
  outString.push(``);

  outString.push(`${cyan('Available types')}`);
  for (const t of POSSIBLE_TYPES) {
    outString.push(`  ${t}`);
  }
  outString.push(``);

  outString.push(`${cyan('Available templates')}`);
  for (const t of templates) {
    let postfix = '';
    if (t.id === 'qwik') {
      postfix = ' (default)';
    }

    outString.push(`  ${t.id}${gray(postfix)}`);
  }

  note(outString.join('\n'), 'Available commands');
}
