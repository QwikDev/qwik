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

describe('path-utils', () => {
  it('normalizes windows-style paths', () => {
    expect(normalizePath('src\\components\\App.tsx')).toBe('src/components/App.tsx');
    expect(getBasename('src\\components\\App.tsx')).toBe('App.tsx');
    expect(getDirectory('src\\components\\App.tsx')).toBe('src/components');
    expect(getExtension('src\\components\\App.tsx')).toBe('.tsx');
    expect(stripExtension('src\\components\\App.tsx')).toBe('src/components/App');
  });

  it('preserves current computeRelPath behavior for paths outside srcDir', () => {
    expect(computeRelPath('src/routes/index.tsx', 'src')).toBe('routes/index.tsx');
    expect(computeRelPath('other/index.tsx', 'src')).toBe('other/index.tsx');
    expect(computeRelPath('src', 'src')).toBe('src');
  });

  it('detects whether a relative import stays within the srcDir-relative tree', () => {
    expect(isRelativePathInsideBase('./styles.css', 'routes/app/index.tsx')).toBe(true);
    expect(isRelativePathInsideBase('../shared/theme.css', 'routes/app/index.tsx')).toBe(true);
    expect(isRelativePathInsideBase('../../../global.css', 'routes/app/index.tsx')).toBe(false);
    expect(isRelativePathInsideBase('../outside.css', 'index.tsx')).toBe(false);
  });
});
