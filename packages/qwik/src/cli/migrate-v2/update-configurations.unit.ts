import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTmpProject } from './tools/tmp-project';
import { updateConfigurations } from './update-configurations';

vi.mock('@clack/prompts', () => ({ log: { error: vi.fn() } }));

describe('updateConfigurations', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  test('sets moduleResolution to bundler', () => {
    project = createTmpProject({
      'tsconfig.json': JSON.stringify({ compilerOptions: { moduleResolution: 'node' } }),
    });
    updateConfigurations();
    expect(JSON.parse(project.read('tsconfig.json')).compilerOptions.moduleResolution).toBe(
      'bundler'
    );
  });

  test('does not throw without a tsconfig.json', () => {
    project = createTmpProject({});
    expect(() => updateConfigurations()).not.toThrow();
  });
});
