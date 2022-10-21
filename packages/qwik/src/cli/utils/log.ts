/* eslint-disable no-console */
import color from 'kleur';
import type { NextSteps } from '../types';

export function logSuccessFooter(docs: string[]) {
  if (docs.length > 0) {
    console.log(`📚 ${color.cyan('Relevant docs:')}`);
    docs.forEach((link) => {
      console.log(`   ${link}`);
    });
  }
  console.log(``);
  console.log(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  console.log(`   https://qwik.builder.io/chat`);
  console.log(`   https://twitter.com/QwikDev`);
  console.log(``);
}

/**
 * Log the next STEPS *ACTION REQUIRED*
 */
export function logNextStep(nextSteps: NextSteps | undefined) {
  if (nextSteps) {
    console.log(`🟣 ${color.bgMagenta(` ${nextSteps.title ?? 'Action Required!'} `)}`);
    nextSteps.lines.forEach((step) => console.log(`   ${step}`));
    console.log(``);
  }
}
