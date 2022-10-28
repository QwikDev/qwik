import type { PluginContext, RollupError } from 'rollup';
import type { ESLint, Linter } from 'eslint';
import type { OptimizerSystem } from '../types';

export interface QwikLinter {
  lint(ctx: PluginContext, code: string, id: string): void;
}

export async function createLinter(sys: OptimizerSystem, rootDir: string): Promise<QwikLinter> {
  const module: typeof import('eslint') = await sys.dynamicImport('eslint');
  const options: ESLint.Options = {
    cache: true,
    useEslintrc: false,
    overrideConfig: {
      root: true,
      env: {
        browser: true,
        es2021: true,
        node: true,
      },

      extends: ['plugin:qwik/recommended'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        tsconfigRootDir: rootDir,
        project: ['./tsconfig.json'],
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  };
  const eslint = new module.ESLint(options) as ESLint;

  return {
    async lint(ctx: PluginContext, code: string, id: string) {
      try {
        const filePath = parseRequest(id);
        if (await eslint.isPathIgnored(filePath)) {
          return null;
        }
        const report = await eslint.lintText(code, {
          filePath,
        });

        report.forEach((file) => {
          for (const message of file.messages) {
            const err = createRollupError(file.filePath, message);
            ctx.warn(err);
          }
        });
      } catch (err) {
        console.warn(err);
      }
    },
  };
}

function parseRequest(id: string) {
  return id.split('?', 2)[0];
}

function createRollupError(id: string, reportMessage: Linter.LintMessage) {
  const err: RollupError = Object.assign(new Error(reportMessage.message), {
    id,
    plugin: 'vite-plugin-eslint',
    loc: {
      file: id,
      column: reportMessage.column,
      line: reportMessage.line,
    },
    stack: '',
  });
  return err;
}
