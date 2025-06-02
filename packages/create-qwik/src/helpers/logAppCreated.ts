import { bgMagenta, bold, cyan, magenta } from 'kleur/colors';

import type { CreateAppResult } from '../../../qwik/src/cli/types';
import { logSuccessFooter } from '../../../qwik/src/cli/utils/log';
import { note } from '../../../qwik/src/cli/utils/utils';
import { outro } from '@clack/prompts';
import { relative } from 'node:path';

export function logAppCreated(pkgManager: string, result: CreateAppResult, ranInstall: boolean) {
  const isCwdDir = process.cwd() === result.outDir;
  const relativeProjectPath = relative(process.cwd(), result.outDir);
  const outString = [];

  if (isCwdDir) {
    outString.push(`🦄 ${bgMagenta(' Success! ')}`);
  } else {
    outString.push(
      `🦄 ${bgMagenta(' Success! ')} ${cyan(`Project created in`)} ${bold(
        magenta(relativeProjectPath)
      )} ${cyan(`directory`)}`
    );
  }
  outString.push(``);

  const qwikAdd = pkgManager !== 'npm' ? `${pkgManager} qwik add` : `npm run qwik add`;
  outString.push(`🤍 ${cyan('Integrations? Add Netlify, Cloudflare, Tailwind...')}`);
  outString.push(`   ${qwikAdd}`);
  outString.push(``);

  outString.push(logSuccessFooter(result.docs));

  outString.push(`👀 ${cyan('Presentations, Podcasts and Videos:')}`);
  outString.push(`   https://qwik.dev/media/`);
  outString.push(``);

  outString.push(`🐰 ${cyan(`Next steps:`)}`);
  if (!isCwdDir) {
    outString.push(`   cd ${relativeProjectPath}`);
  }
  if (!ranInstall) {
    outString.push(`   ${pkgManager} install`);
  }
  if (pkgManager === 'deno') {
    outString.push(`   deno task start`);
  } else {
    outString.push(`   ${pkgManager} start`);
  }
  outString.push(``);

  note(outString.join('\n'), 'Result');

  outro('Happy coding! 🎉');
}
