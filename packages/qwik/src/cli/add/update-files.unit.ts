import { fs } from 'memfs';
import { join } from 'path';
import { describe, expect, test, vi } from 'vitest';
import type { FsUpdates, UpdateAppOptions } from '../types';
import { mergeIntegrationDir } from './update-files';

vi.mock('node:fs', () => ({
  default: fs,
}));

function setup() {
  const fakeSrcDir = 'srcDir/subSrcDir';
  createFakeFiles(fakeSrcDir);

  const fakeDestDir = 'destDir/subDestDir';

  const fakeFileUpdates: FsUpdates = {
    files: [],
    installedDeps: {},
    installedScripts: [],
  };

  const fakeOpts: UpdateAppOptions = {
    rootDir: fakeDestDir,
    integration: 'integration',
  };

  return {
    fakeSrcDir,
    fakeDestDir,
    fakeFileUpdates,
    fakeOpts,
  };
}

function createFakeFiles(dir: string) {
  // Create fake src files
  fs.mkdirSync(join(dir, 'src'), { recursive: true });
  fs.writeFileSync(join(dir, 'fake.ts'), 'fake file');
  fs.writeFileSync(join(dir, 'package.json'), '{"name": "fake"}');
  fs.writeFileSync(join(dir, 'src', 'global.css'), 'p{color: red}');
}

describe('mergeIntegrationDir', () => {
  test('should merge integration directory', async () => {
    const { fakeSrcDir, fakeDestDir, fakeFileUpdates, fakeOpts } = setup();

    await mergeIntegrationDir(fakeFileUpdates, fakeOpts, fakeSrcDir, fakeDestDir);

    const actualResults = fakeFileUpdates.files.map((f) => f.path);
    const expectedResults = [
      'destDir/subDestDir/fake.ts',
      'destDir/subDestDir/package.json',
      'destDir/subDestDir/src/global.css',
    ];

    expect(actualResults).toEqual(expectedResults);
  });

  test('should merge integration directory in a monorepo', async () => {
    const { fakeSrcDir, fakeDestDir, fakeFileUpdates, fakeOpts } = setup();

    // Create a global file in the destination director
    const monorepoSubDir = join(fakeDestDir, 'apps', 'subpackage', 'src');
    fs.mkdirSync(monorepoSubDir, { recursive: true });
    fs.writeFileSync(join(monorepoSubDir, 'global.css'), '/* CSS */');

    // Add a file that should stay in the root
    fs.writeFileSync(join(fakeSrcDir, 'should-stay-in-root.ts'), 'fake file');

    // Creating a folder that should stay in the root
    fs.mkdirSync(join(fakeSrcDir, 'should-stay'), { recursive: true });
    fs.writeFileSync(join(fakeSrcDir, 'should-stay', 'should-also-stay.ts'), 'fake file');

    fakeOpts.projectDir = 'apps/subpackage';
    fakeOpts.installDeps = true;
    const fakeAlwaysInRoot = ['should-stay-in-root.ts', 'should-stay'];

    await mergeIntegrationDir(fakeFileUpdates, fakeOpts, fakeSrcDir, fakeDestDir, fakeAlwaysInRoot);

    const actualResults = fakeFileUpdates.files.map((f) => f.path);
    const expectedResults = [
      `destDir/subDestDir/apps/subpackage/fake.ts`,
      `destDir/subDestDir/should-stay-in-root.ts`,
      `destDir/subDestDir/package.json`,
      `destDir/subDestDir/should-stay/should-also-stay.ts`,
      `destDir/subDestDir/apps/subpackage/src/global.css`,
    ];

    expect(actualResults).toEqual(expectedResults);

    const actualGlobalCssContent = fakeFileUpdates.files.find(
      (f) => f.path === `destDir/subDestDir/apps/subpackage/src/global.css`
    )?.content;

    expect(actualGlobalCssContent).toBe('p{color: red}\n\n/* CSS */\n');
  });
});
