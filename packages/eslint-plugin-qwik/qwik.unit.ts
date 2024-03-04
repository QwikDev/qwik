import * as vitest from 'vitest';
// @ts-ignore
import { RuleTester } from '@typescript-eslint/rule-tester';

import { fileURLToPath } from 'node:url';
import { rules } from './index';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'path';

// https://typescript-eslint.io/packages/rule-tester/#vitest
RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const testConfig = {
  parser: '@typescript-eslint/parser',
  env: {
    es6: true,
  },
  parserOptions: {
    tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
    project: ['./tests/tsconfig.json'],
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2020,
    sourceType: 'module',
  },
};

const ruleTester = new RuleTester(testConfig as any);
interface TestCase {
  name: string;
  filename: string;
  code: string;
}
interface InvalidTestCase extends TestCase {
  errors: { messageId: string }[];
}
await (async function setupEsLintRuleTesters() {
  // list './test' directory content and set up one RuleTester per directory
  const testDir = join(dirname(new URL(import.meta.url).pathname), './tests');
  const ruleNames = await readdir(testDir);
  for (const ruleName of ruleNames) {
    const rule = rules[ruleName];
    if (ruleName.endsWith('.json')) {
      continue;
    }
    if (!rule) {
      throw new Error(
        `Test directory has rule '${ruleName}' but related eslint rule is missing. Valid rules are: ${Object.keys(
          rules
        ).join(', ')}`
      );
    }
    const ruleDir = join(testDir, ruleName);
    const valid: TestCase[] = [];
    const invalid: InvalidTestCase[] = [];
    const testCaseNames = await readdir(ruleDir);
    for (const testCaseName of testCaseNames) {
      let path = join(ruleDir, testCaseName);
      while ((await stat(path)).isDirectory()) {
        const files = await readdir(path);
        if (files.length !== 1) {
          throw new Error(`Test directory '${path}' must have exactly one file.`);
        }
        path = join(path, files[0]);
      }
      const code = String(await readFile(path, 'utf-8'));
      const filename = path.replace(testDir, './tests');
      if (testCaseName.startsWith('valid-')) {
        valid.push({ name: testCaseName, filename, code });
      } else if (testCaseName.startsWith('invalid-')) {
        const EXPECT_ERROR_COMMENT = '// Expect error: ';
        const errors = code
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith(EXPECT_ERROR_COMMENT))
          .map((line) => JSON.parse(line.substring(EXPECT_ERROR_COMMENT.length)));
        if (!errors.length) {
          throw new Error(
            `Invalid test case '${filename}' does not have '${EXPECT_ERROR_COMMENT}' comment.`
          );
        }
        invalid.push({ name: testCaseName, filename, code, errors });
      } else {
        throw new Error(`Unexpected file '${testCaseName}' in directory '${ruleDir}'`);
      }
    }
    if (valid.length || invalid.length) {
      await ruleTester.run(ruleName, rule, { valid, invalid });
    }
  }
})();
