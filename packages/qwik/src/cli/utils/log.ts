import type { NextSteps } from '../types';
import { cyan } from 'kleur/colors';

export function logSuccessFooter(docs: string[]) {
  const outString = [];

  if (docs.length > 0) {
    outString.push(`📄 ${cyan('Relevant docs:')}`);
    for (let i = 0; i < docs.length; i++) {
      const link = docs[i];
      outString.push(`   ${link}`);
    }
  }
  outString.push(``);
  outString.push(`💬 ${cyan('Questions? Start the conversation at:')}`);
  outString.push(`   https://qwik.dev/chat`);
  outString.push(`   https://twitter.com/QwikDev`);
  outString.push(``);

  return outString.join('\n');
}

/** Log the next STEPS _ACTION REQUIRED_ */
export function logNextStep(nextSteps: NextSteps | undefined, packageManager: string) {
  const outString: string[] = [];
  if (nextSteps) {
    for (let i = 0; i < nextSteps.lines.length; i++) {
      const step = nextSteps.lines[i];
      outString.push(`${step.replace(/\bpnpm\b/g, packageManager)}`);
    }
  }
  return outString.join('\n');
}
