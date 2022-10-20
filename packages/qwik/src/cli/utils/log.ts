/* eslint-disable no-console */
import color from 'kleur';

export function logSuccessFooter() {
  console.log(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  console.log(`   https://qwik.builder.io/chat`);
  console.log(`   https://twitter.com/QwikDev`);
  console.log(``);
  console.log(`📺 ${color.cyan('Presentations, Podcasts and Videos:')}`);
  console.log(`   https://qwik.builder.io/media/`);
  console.log(``);
}

/**
 * Log the next STEPS *ACTION REQUIRED*
 */
export function logNextStep(steps: string[]) {
  if (steps.length) {
    console.log(`🔴 ${color.bgGreen(` ACTION REQUIRED! `)}`);
    steps.forEach((step) => console.log(`${step}`));
    console.log(``);
  }
}
