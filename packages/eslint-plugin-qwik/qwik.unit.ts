import { RuleTester, type RuleTesterConfig } from '@typescript-eslint/rule-tester';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vitest from 'vitest';
import { rules } from './index';

// https://typescript-eslint.io/packages/rule-tester/#vitest
RuleTester.afterAll = vitest.afterAll;
RuleTester.it = vitest.it;
RuleTester.itOnly = vitest.it.only;
RuleTester.describe = vitest.describe;

const testConfig = {
  rules: {
    'no-console': 'error',
  },
  languageOptions: {
    parserOptions: {
      sourceType: 'module',
      ecmaFeatures: {
        jsx: true,
      },
      ecmaVersion: 2024,
      project: ['./tests/tsconfig.json'],
      tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
    },
  },
} as RuleTesterConfig;

const ruleTester = new RuleTester(testConfig);
type RuleTesterRule = Parameters<RuleTester['defineRule']>[1];

interface TestCase {
  name: string;
  filename: string;
  code: string;
}
interface InvalidTestCase extends TestCase {
  errors: { messageId: string }[];
}

const isRuleName = (ruleName: string): ruleName is keyof typeof rules =>
  Object.prototype.hasOwnProperty.call(rules, ruleName);

await (async function setupEsLintRuleTesters() {
  // list './test' directory content and set up one RuleTester per directory
  let testDir = join(dirname(fileURLToPath(import.meta.url)), './tests');
  const isWindows = process.platform === 'win32';
  if (isWindows && testDir.startsWith('\\')) {
    // in Windows testDir starts with a \ causing errors
    testDir = testDir.substring(1);
  }

  const ruleNames = (await readdir(testDir)) as (keyof typeof rules)[];
  for (const ruleName of ruleNames) {
    if (ruleName.endsWith('.json')) {
      continue;
    }
    if (!isRuleName(ruleName)) {
      throw new Error(
        `Test directory has rule '${ruleName}' but related eslint rule is missing. Valid rules are: ${Object.keys(
          rules
        ).join(', ')}`
      );
    }
    const rule = rules[ruleName] as RuleTesterRule;
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
      ruleTester.run(ruleName, rule as any, { valid, invalid });
    }
  }
})();
