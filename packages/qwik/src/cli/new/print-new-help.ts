import pc from 'picocolors';
import { loadTemplates } from '../utils/templates';
import { pmRunCmd, note } from '../utils/utils';

export async function printNewHelp() {
  const pmRun = pmRunCmd();
  const templates = await loadTemplates();

  const outString = [];
  outString.push(`${pc.cyan('Interactive')}`);
  outString.push(`  ${pmRun} qwik ${pc.magenta(`new`)}`);

  outString.push(``);
  outString.push(`${pc.cyan('New route')}`);
  outString.push(
    `  ${pmRun} qwik ${pc.magenta(`new /about`)}: ${pc.dim('Create a new route for /about')}`
  );

  outString.push(``);
  outString.push(`${pc.cyan('New component')}`);
  outString.push(
    `  ${pmRun} qwik ${pc.magenta(`new my-button`)}: ${pc.dim(
      'Create a new component in src/components/my-button'
    )}`
  );
  outString.push(
    `  ${pmRun} qwik ${pc.magenta(`new nested/my-button`)}: ${pc.dim(
      'Create a new component in src/components/nested/my-button'
    )}`
  );

  outString.push(``);
  outString.push(`${pc.cyan('Available templates')}`);
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    let postfix = '';
    if (t.id === 'qwik') {
      postfix = ' (default)';
    }

    outString.push(`  ${t.id}${pc.gray(postfix)}`);
  }

  note(outString.join('\n'), 'Available commands');
}
