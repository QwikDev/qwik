import { cpSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AppCommand } from '../utils/app-command';
import { runV2Migration } from './run-migration';
import { createTmpProject } from './tools/tmp-project';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  confirm: vi.fn(async () => true),
  isCancel: () => false,
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('./update-dependencies', () => ({
  installTsMorph: vi.fn(async () => false),
  removeTsMorphFromPackageJson: vi.fn(),
  updateDependencies: vi.fn(),
}));

const STARTERS = join(__dirname, '../../../../../starters');

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

describe('runV2Migration on the v1 starters', () => {
  let project: ReturnType<typeof createTmpProject>;
  afterEach(() => project.cleanup());

  test('migrates the playground app with the express adapter', async () => {
    project = createTmpProject({});
    for (const starter of ['apps/base', 'apps/playground', 'adapters/express']) {
      cpSync(join(STARTERS, starter), project.dir, {
        recursive: true,
        filter: (src) => !src.endsWith('package.json') || starter === 'apps/base',
      });
    }
    renameSync(join(project.dir, 'gitignore'), join(project.dir, '.gitignore'));
    const pkg = JSON.parse(project.read('package.json'));
    pkg.devDependencies['@builder.io/qwik'] = '1.19.0';
    pkg.devDependencies['@builder.io/qwik-city'] = '1.19.0';
    writeFileSync(join(project.dir, 'package.json'), JSON.stringify(pkg, null, 2));

    await runV2Migration({} as AppCommand);

    for (const file of listFiles(project.dir)) {
      if (/\.(tsx?|json|js)$/.test(file)) {
        expect(readFileSync(file, 'utf-8'), relative(project.dir, file)).not.toContain(
          '@builder.io/qwik'
        );
      }
    }
    const express = project.read('src/entry.express.tsx');
    expect(express).toContain('type QwikRouterPlatform = PlatformNode;');
    expect(express).toContain('const { router } = createQwikRouter({');
    expect(express).not.toContain('qwikCityPlan');
    expect(express).toContain('requestBodyLimit: Number.MAX_SAFE_INTEGER,');
    expect(express).toContain(`app.use((_req, res) => res.headersSent || res.writeHead(404`);
    expect(project.read('src/root.tsx')).toContain('<QwikRouterProvider viewTransition={true}>');
    expect(project.read('src/routes/index.tsx')).toContain(
      'export const head: DocumentHead = () => ({'
    );
    expect(project.read('src/entry.ssr.tsx')).toContain(
      `streaming: { ...opts.streaming, inOrder: { strategy: 'auto', maximumInitialChunk: 50000, maximumChunk: 30000 } },`
    );
    expect(project.read('vite.config.ts')).toContain('qwikRouter({ strictLoaders: false })');
    expect(project.exists('src/routes/plugin@000-v1-errors.ts')).toBe(true);
  });
});
