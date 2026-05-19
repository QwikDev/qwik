import { describe, expect, it } from 'vitest';
import {
  computeRelPath,
  getBasename,
  getDirectory,
  getExtension,
  isRelativePathInsideBase,
  normalizePath,
  stripExtension,
} from '../../src/optimizer/path-utils.js';
import { mkFilePath, mkRelativePath } from '../../src/optimizer/types/brands.js';

describe('path-utils', () => {
  it('normalizes windows-style paths', () => {
    expect(normalizePath('src\\components\\App.tsx')).toBe('src/components/App.tsx');
    expect(getBasename('src\\components\\App.tsx')).toBe('App.tsx');
    expect(getDirectory('src\\components\\App.tsx')).toBe('src/components');
    expect(getExtension('src\\components\\App.tsx')).toBe('.tsx');
    expect(stripExtension('src\\components\\App.tsx')).toBe('src/components/App');
  });

  it('preserves current computeRelPath behavior for paths outside srcDir', () => {
    expect(computeRelPath(mkFilePath('src/routes/index.tsx'), mkFilePath('src'))).toBe('routes/index.tsx');
    expect(computeRelPath(mkFilePath('other/index.tsx'), mkFilePath('src'))).toBe('other/index.tsx');
    expect(computeRelPath(mkFilePath('src'), mkFilePath('src'))).toBe('src');
  });

  it('strips leading slash in fallback so output always satisfies RelativePath (OSS-385)', () => {
    // When the input is absolute and the fallback fires (path doesn't sit
    // under srcDir), the returned value must not start with `/` — that's
    // the contract the `RelativePath` brand validates. Without the strip,
    // `mkRelativePath(computeRelPath(...))` would throw at construction.
    expect(computeRelPath(mkFilePath('/abs/foo.tsx'), mkFilePath('src'))).toBe('abs/foo.tsx');
    expect(computeRelPath(mkFilePath('/some/other/path.tsx'), mkFilePath('.'))).toBe('some/other/path.tsx');
    // Non-absolute input is unaffected.
    expect(computeRelPath(mkFilePath('relative/path.tsx'), mkFilePath('src'))).toBe('relative/path.tsx');
  });

  it('detects whether a relative import stays within the srcDir-relative tree', () => {
    expect(isRelativePathInsideBase('./styles.css', mkRelativePath('routes/app/index.tsx'))).toBe(true);
    expect(isRelativePathInsideBase('../shared/theme.css', mkRelativePath('routes/app/index.tsx'))).toBe(true);
    expect(isRelativePathInsideBase('../../../global.css', mkRelativePath('routes/app/index.tsx'))).toBe(false);
    expect(isRelativePathInsideBase('../outside.css', mkRelativePath('index.tsx'))).toBe(false);
  });
});
