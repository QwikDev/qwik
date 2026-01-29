/** Do NOT allow using `npm` as package manager. */
if (process.env.npm_execpath.indexOf('pnpm') === -1) {
  console.error('You must use pnpm to install dependencies:');
  console.error('  $ pnpm install');
  process.exit(1);
}
