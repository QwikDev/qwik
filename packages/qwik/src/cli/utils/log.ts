import color from 'kleur';
import type { NextSteps } from '../types';

export function logSuccessFooter(docs: string[]) {
  const outString = [];

  if (docs.length > 0) {
    outString.push(`📄 ${color.cyan('Relevant docs:')}`);
    docs.forEach((link) => {
      outString.push(`   ${link}`);
    });
  }
  outString.push(``);
  outString.push(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  outString.push(`   https://qwik.builder.io/chat`);
  outString.push(`   https://twitter.com/QwikDev`);
  outString.push(``);

  return outString.join('\n');
}

/**
 * Log the next STEPS *ACTION REQUIRED*
 */
export function logNextStep(nextSteps: NextSteps | undefined) {
  const outString = [];
  if (nextSteps) {
    outString.push(`🟣 ${color.bgMagenta(` ${nextSteps.title ?? 'Action Required!'} `)}`);
    nextSteps.lines.forEach((step) => outString.push(`   ${step}`));
    outString.push(``);
  }
  return outString.join('\n');
}
