import { execSync } from 'child_process';
// run-command.js
const arg = process.argv[2]; // get the argument
const command = `playwright test ${arg} --browser=chromium --config e2e/qwik-e2e/playwright.config.ts`; // insert the argument into the command
execSync(command, { stdio: 'inherit' }); // run the command
