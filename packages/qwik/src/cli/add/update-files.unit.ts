import { JsonObjectNode, JsonParser } from '@croct/json5-parser';
import { fs } from 'memfs';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { normalizePath } from '../../testing/util';
import type { FsUpdates, UpdateAppOptions } from '../types';
import { mergeIntegrationDir } from './update-files';

vi.mock('node:fs', () => ({
  default: fs,
}));

let fakeSrcDir: string;
let fakeDestDir: string;
let fakeFileUpdates: FsUpdates;
let fakeOpts: UpdateAppOptions;

beforeEach(() => {
  // Reset the mock filesystem before each test
  fs.mkdirSync(join('srcDir', 'subSrcDir'), { recursive: true });
  fs.mkdirSync(join('destDir', 'subDestDir'), { recursive: true });

  fakeSrcDir = join('srcDir', 'subSrcDir');
  createFakeFiles(fakeSrcDir);

  fakeDestDir = join('destDir', 'subDestDir');

  fakeFileUpdates = {
    files: [],
    installedDeps: {},
    installedScripts: [],
  };

  fakeOpts = {
    rootDir: fakeDestDir,
    integration: 'integration',
  };
});

afterEach(() => {
  vi.clearAllMocks();
  // Clean up the mock filesystem
  fs.rmSync(join('srcDir'), { recursive: true, force: true });
  fs.rmSync(join('destDir'), { recursive: true, force: true });
});

function createFakeFiles(dir: string) {
  // Create fake src files
  fs.mkdirSync(join(dir, 'src'), { recursive: true });
  fs.writeFileSync(join(dir, 'fake.ts'), 'fake file');
  fs.writeFileSync(join(dir, 'package.json'), '{"name": "fake"}');
  fs.writeFileSync(join(dir, 'src', 'global.css'), 'p{color: red}');
  fs.mkdirSync(join(dir, '.vscode'), { recursive: true });
  const settings = JsonParser.parse<JsonObjectNode>(
    `{
          // Comment
          "name": "John Doe",
          "age": 42,
      }`,
    JsonObjectNode
  );
  fs.writeFileSync(join(dir, '.vscode', 'settings.json'), settings.toString());
}

describe('mergeIntegrationDir', () => {
  test('should merge integration directory', async () => {
    await mergeIntegrationDir(fakeFileUpdates, fakeOpts, fakeSrcDir, fakeDestDir);

    const actualResults = fakeFileUpdates.files.map((f) => normalizePath(f.path));
    const expectedResults = [
      normalizePath(join('destDir', 'subDestDir', 'fake.ts')),
      normalizePath(join('destDir', 'subDestDir', 'package.json')),
      'destDir/subDestDir/.vscode/settings.json',
      normalizePath(join('destDir', 'subDestDir', 'src', 'global.css')),
    ];

    expect(actualResults.sort()).toEqual(expectedResults.sort());
  });

  test('should merge integration directory in a monorepo', async () => {
    // Create a global file in the destination director
    const monorepoSubDir = join(fakeDestDir, 'apps', 'subpackage', 'src');
    fs.mkdirSync(monorepoSubDir, { recursive: true });
    fs.writeFileSync(join(monorepoSubDir, 'global.css'), '/* CSS */');
    const settings = JsonParser.parse<JsonObjectNode>(
      `{ 
          // Comment Foo
          "css.lint.unknownAtRules": "ignore"
      }`,
      JsonObjectNode
    );
    fs.mkdirSync(join(fakeDestDir, 'apps', 'subpackage', '.vscode'));
    fs.writeFileSync(
      join(fakeDestDir, 'apps', 'subpackage', '.vscode', 'settings.json'),
      settings.toString()
    );

    // Add a file that should stay in the root
    fs.writeFileSync(join(fakeSrcDir, 'should-stay-in-root.ts'), 'fake file');

    // Creating a folder that should stay in the root
    fs.mkdirSync(join(fakeSrcDir, 'should-stay'), { recursive: true });
    fs.writeFileSync(join(fakeSrcDir, 'should-stay', 'should-also-stay.ts'), 'fake file');

    fakeOpts.projectDir = join('apps', 'subpackage');
    fakeOpts.installDeps = true;
    const fakeAlwaysInRoot = ['should-stay-in-root.ts', 'should-stay'];

    await mergeIntegrationDir(fakeFileUpdates, fakeOpts, fakeSrcDir, fakeDestDir, fakeAlwaysInRoot);

    const actualResults = fakeFileUpdates.files.map((f) => normalizePath(f.path));
    const expectedResults = [
      normalizePath(join('destDir', 'subDestDir', 'apps', 'subpackage', 'fake.ts')),
      normalizePath(join('destDir', 'subDestDir', 'should-stay-in-root.ts')),
      normalizePath(join('destDir', 'subDestDir', 'package.json')),
      normalizePath(join('destDir', 'subDestDir', 'should-stay', 'should-also-stay.ts')),
      'destDir/subDestDir/apps/subpackage/.vscode/settings.json',
      normalizePath(join('destDir', 'subDestDir', 'apps', 'subpackage', 'src', 'global.css')),
    ];

    expect(actualResults.sort()).toEqual(expectedResults.sort());

    const tests = {
      'destDir/subDestDir/apps/subpackage/fake.ts': 'fake file',
      'destDir/subDestDir/should-stay-in-root.ts': 'fake file',
      'destDir/subDestDir/package.json': '{"name": "fake"}',
      'destDir/subDestDir/should-stay/should-also-stay.ts': 'fake file',
      'destDir/subDestDir/apps/subpackage/.vscode/settings.json':
        '{ \n          // Comment Foo\n          "css.lint.unknownAtRules": "ignore",\n          // Comment\n          "name": "John Doe",\n          "age": 42,\n      }\n',
      'destDir/subDestDir/apps/subpackage/src/global.css': 'p{color: red}\n\n/* CSS */\n',
    };
    for (const [fileName, content] of Object.entries(tests)) {
      const file = fakeFileUpdates.files.find((f) => normalizePath(f.path) === fileName);
      if (!file) {
        console.error(`File %s not found:`, fakeFileUpdates.files);
      }
      expect(file?.content.toString()).toBe(content);
    }
  });
});
