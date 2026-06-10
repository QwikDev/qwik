import { describe, expect, it } from 'vitest';
import {
  computeRelPath,
  getBasename,
  getDirectory,
  getExtension,
  isRelativePathInsideBase,
  normalizePath,
  stripExtension,
} from '../../src/paths.js';
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

  it('emits a `../`-relative path when both input and srcDir are absolute and input is outside srcDir', () => {
    // The bundler hands the optimizer an absolute path for a lib living in
    // `node_modules` outside srcDir. The origin must come out as a well-formed
    // relative path (matching SWC) so the bundler can anchor the segment's own
    // relative imports against it — a slash-stripped absolute would not resolve.
    expect(
      computeRelPath(
        mkFilePath('/proj/node_modules/@qwik.dev/router/lib/index.qwik.mjs'),
        mkFilePath('/proj/fixtures/app'),
      ),
    ).toBe('../../node_modules/@qwik.dev/router/lib/index.qwik.mjs');
    expect(
      computeRelPath(mkFilePath('/proj/node_modules/dep/x.mjs'), mkFilePath('/proj')),
    ).toBe('node_modules/dep/x.mjs');
    // Mixed operands (relative srcDir) still fall back to slash-stripping, since
    // `relative()` is only trustworthy when both paths are absolute.
    expect(computeRelPath(mkFilePath('/abs/foo.tsx'), mkFilePath('src'))).toBe('abs/foo.tsx');
  });

  it('detects whether a relative import stays within the srcDir-relative tree', () => {
    expect(isRelativePathInsideBase('./styles.css', mkRelativePath('routes/app/index.tsx'))).toBe(true);
    expect(isRelativePathInsideBase('../shared/theme.css', mkRelativePath('routes/app/index.tsx'))).toBe(true);
    expect(isRelativePathInsideBase('../../../global.css', mkRelativePath('routes/app/index.tsx'))).toBe(false);
    expect(isRelativePathInsideBase('../outside.css', mkRelativePath('index.tsx'))).toBe(false);
  });
});
