import * as vitest from 'vitest';
import { RuleTester, type RuleTesterConfig } from '@typescript-eslint/rule-tester';
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
  rules: {
    'no-console': 'error',
  },
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts*'],
      },
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
  let testDir = join(dirname(new URL(import.meta.url).pathname), './tests');
  const isWindows = process.platform === 'win32';
  if (isWindows && testDir.startsWith('\\')) {
    // in Windows testDir starts with a \ causing errors
    testDir = testDir.substring(1);
  }

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
