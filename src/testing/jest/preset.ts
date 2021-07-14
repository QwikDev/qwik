import { join } from 'path';

const testingDir = __dirname;
const packageRootDir = join(testingDir, '..');

const moduleExtensions = ['ts', 'tsx', 'js', 'mjs', 'jsx'];
const moduleExtensionRegexp = '(' + moduleExtensions.join('|') + ')';

const jestPreset = {
  moduleFileExtensions: [...moduleExtensions, 'json', 'd.ts'],
  moduleNameMapper: {
    '^@builder.io/qwik/jsx-runtime$': join(packageRootDir, 'jsx-runtime._MODULE_EXT_'),
    '^@builder.io/qwik/optimizer$': join(packageRootDir, 'optimizer._MODULE_EXT_'),
    '^@builder.io/qwik/server$': join(testingDir, 'index._MODULE_EXT_'),
    '^@builder.io/qwik/testing$': join(testingDir, 'index._MODULE_EXT_'),
    '^@builder.io/qwik$': join(packageRootDir, 'core._MODULE_EXT_'),
  },
  modulePathIgnorePatterns: ['<rootDir>/build', '<rootDir>/dist'],
  setupFilesAfterEnv: [join(testingDir, 'jest-setuptestframework._MODULE_EXT_')],
  testPathIgnorePatterns: ['/.cache', '/.github', '/.vscode', '/build', '/dist', '/node_modules'],
  testRegex: '(/__tests__/.*|\\.?(test|spec|unit))\\.' + moduleExtensionRegexp + '$',
  transform: {
    '^.+\\.(ts|tsx|jsx)$': join(__dirname, 'jest-preprocessor._MODULE_EXT_'),
  },
  watchPathIgnorePatterns: ['^.+\\.d\\.ts$'],
};

export default jestPreset;
