import * as fs from 'fs';
import { resolve } from 'path';
import { rules, configs } from '../packages/eslint-plugin-qwik/index';

const outputPath = resolve(
  process.cwd(),
  'packages/docs/src/routes/docs/(qwik)/advanced/eslint/rules.json'
);

fs.writeFileSync(outputPath, JSON.stringify({ rules, configs }, null, 2));

console.log(rules, outputPath);
