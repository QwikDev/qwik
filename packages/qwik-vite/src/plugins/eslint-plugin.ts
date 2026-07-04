import type { Rolldown } from 'vite';
import type { ESLint } from 'eslint';
import type { OptimizerSystem } from '../types';
import { createRolldownError } from './vite-utils';

export interface QwikLinter {
  lint(ctx: Rolldown.PluginContext, code: string, id: string): void;
}

export async function createLinter(
  sys: OptimizerSystem,
  rootDir: string,
  tsconfigFileNames: string[]
): Promise<QwikLinter> {
  const module: typeof import('eslint') = await sys.dynamicImport('eslint');

  let eslint = new module.ESLint({ cache: true }) as ESLint;
  const eslintConfig = await eslint.calculateConfigForFile('no-real-file.tsx');
  const invalidEslintConfig = eslintConfig.parser === null;

  if (invalidEslintConfig) {
    const options: ESLint.Options = {
      cache: true,

      overrideConfig: {
        languageOptions: {
          parserOptions: {
            tsconfigRootDir: rootDir,
            project: tsconfigFileNames,
            ecmaVersion: 2022,
            sourceType: 'module',
            ecmaFeatures: {
              jsx: true,
            },
          },
        },
      },
    };
    eslint = new module.ESLint(options) as ESLint;
  }

  return {
    async lint(ctx: Rolldown.PluginContext, code: string, id: string) {
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
            if (message.ruleId != null && !message.ruleId.startsWith('qwik/')) {
              continue;
            }
            ctx.warn(
              createRolldownError(message.message, file.filePath, 'vite-plugin-eslint', {
                file: file.filePath,
                column: message.column,
                line: message.line,
              })
            );
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
