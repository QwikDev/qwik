import { useMethodUsageExamples } from './src/useMethodUsage';

export type QwikEslintExample = {
  code: string;
  codeHighlight?: string;
  description?: string;
};

export type QwikEslintExamples = Record<
  string,
  {
    good: QwikEslintExample[];
    bad: QwikEslintExample[];
  }
>;

export const examples = {
  'use-method-usage': useMethodUsageExamples,
  'valid-lexical-scope': null,
  'loader-location': null,
  'no-react-props': null,
  'prefer-classlist': null,
  'jsx-no-script-url': null,
  'jsx-key': null,
  'unused-server': null,
  'jsx-img': null,
};
