import { join } from 'path';

const testingDir = __dirname;
const packageRootDir = join(testingDir, '..');

const ext = '.' + (globalThis as any).MODULE_EXT;

const moduleExtensions = ['ts', 'tsx', 'js', 'mjs', 'jsx'];
const moduleExtensionRegexp = '(' + moduleExtensions.join('|') + ')';

const jestPreset = {
  moduleFileExtensions: [...moduleExtensions, 'json', 'd.ts'],
  moduleNameMapper: {
    '^@builder.io/qwik/core$': join(packageRootDir, 'core' + ext),
    '^@builder.io/qwik/jsx-runtime$': join(packageRootDir, 'jsx-runtime' + ext),
    '^@builder.io/qwik/optimizer$': join(packageRootDir, 'optimizer' + ext),
    '^@builder.io/qwik/server$': join(packageRootDir, 'server', 'index' + ext),
    '^@builder.io/qwik/testing$': join(testingDir, 'index' + ext),
    '^@builder.io/qwik$': join(packageRootDir, 'core' + ext),
  },
  modulePathIgnorePatterns: ['<rootDir>/build', '<rootDir>/dist'],
  testPathIgnorePatterns: ['/.cache', '/.github', '/.vscode', '/build', '/dist', '/node_modules'],
  testRegex: '(/__tests__/.*|\\.?(test|spec|unit))\\.' + moduleExtensionRegexp + '$',
  transform: {
    '^.+\\.(ts|tsx|jsx)$': join(__dirname, 'jest-preprocessor' + ext),
  },
  watchPathIgnorePatterns: ['^.+\\.d\\.ts$'],
};

export default jestPreset;
