import { afterEach, describe, expect, test, vi } from 'vitest';
import { takeWarnings } from './report';
import { createTmpProject } from './tools/tmp-project';
import { updateConfigurations } from './update-configurations';

vi.mock('@clack/prompts', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

describe('updateConfigurations', () => {
  let project: ReturnType<typeof createTmpProject> | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  const tsconfig = (compilerOptions: object) => {
    project?.cleanup();
    project = createTmpProject({ 'tsconfig.json': JSON.stringify({ compilerOptions }) });
    updateConfigurations();
    return JSON.parse(project!.read('tsconfig.json')).compilerOptions;
  };

  test('sets moduleResolution to Bundler for resolutions without exports support', () => {
    expect(tsconfig({ module: 'ES2022', moduleResolution: 'node' })).toEqual({
      module: 'ES2022',
      moduleResolution: 'Bundler',
    });
    expect(tsconfig({ module: 'ES2020' })).toEqual({
      module: 'ES2020',
      moduleResolution: 'Bundler',
    });
  });

  test('also switches CommonJS modules to ESNext, which Bundler requires', () => {
    expect(tsconfig({ module: 'CommonJS', moduleResolution: 'node10' })).toEqual({
      module: 'ESNext',
      moduleResolution: 'Bundler',
    });
    expect(tsconfig({})).toEqual({ moduleResolution: 'Bundler', module: 'ESNext' });
  });

  test('keeps resolutions that support exports', () => {
    for (const options of [
      { module: 'ESNext', moduleResolution: 'Bundler' },
      { module: 'NodeNext', moduleResolution: 'NodeNext' },
      { module: 'Node16' },
    ]) {
      expect(tsconfig(options)).toEqual(options);
    }
  });

  test('keeps comments and formatting', () => {
    const content = `{\n  // comment\n  "compilerOptions": {\n    "moduleResolution": "node", // why\n    "module": "ES2022",\n  },\n}\n`;
    project = createTmpProject({ 'tsconfig.json': content });
    updateConfigurations();
    expect(project!.read('tsconfig.json')).toBe(content.replace('"node"', '"Bundler"'));
  });

  test('makes the app an ES module and warns about CommonJS files', () => {
    project = createTmpProject({
      'package.json': `{\n  "name": "app",\n  "type": "commonjs"\n}\n`,
      'postcss.config.js': `module.exports = { plugins: {} };`,
      'src/a.js': `export const a = 1;`,
    });
    updateConfigurations();
    expect(project.read('package.json')).toBe(`{\n  "name": "app",\n  "type": "module"\n}\n`);
    expect(takeWarnings()).toEqual([
      'postcss.config.js: the app is now an ES module, rename this CommonJS file to `.cjs`.',
    ]);
  });

  test('adds the type to package.json', () => {
    project = createTmpProject({ 'package.json': `{\n  "name": "app"\n}\n` });
    updateConfigurations();
    expect(JSON.parse(project.read('package.json'))).toEqual({ name: 'app', type: 'module' });
  });

  test('renames vite.config.mts and its references', () => {
    project = createTmpProject({
      'package.json': `{"type":"module","scripts":{"build":"vite build -c vite.config.mts"}}`,
      'vite.config.mts': `export default {};`,
      'adapters/node/vite.config.ts': `import baseConfig from '../../vite.config.mts';`,
    });
    updateConfigurations();
    expect(project.exists('vite.config.mts')).toBe(false);
    expect(project.read('vite.config.ts')).toBe(`export default {};`);
    expect(project.read('package.json')).toContain('vite build -c vite.config.ts');
    expect(project.read('adapters/node/vite.config.ts')).toBe(
      `import baseConfig from '../../vite.config.ts';`
    );
  });

  test('does not throw without a tsconfig.json', () => {
    project = createTmpProject({});
    expect(() => updateConfigurations()).not.toThrow();
  });
});
