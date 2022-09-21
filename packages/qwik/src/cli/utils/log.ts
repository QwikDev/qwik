/* eslint-disable no-console */
import color from 'kleur';

export function logSuccessFooter() {
  console.log(`💬 ${color.cyan('Questions? Start the conversation at:')}`);
  console.log(`   https://qwik.builder.io/chat`);
  console.log(`   https://twitter.com/QwikDev`);
  console.log(``);
}
