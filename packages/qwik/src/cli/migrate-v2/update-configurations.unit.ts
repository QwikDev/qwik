import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTmpProject } from './tools/tmp-project';
import { updateConfigurations } from './update-configurations';

vi.mock('@clack/prompts', () => ({ log: { error: vi.fn() } }));

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

  test('does not throw without a tsconfig.json', () => {
    project = createTmpProject({});
    expect(() => updateConfigurations()).not.toThrow();
  });
});
