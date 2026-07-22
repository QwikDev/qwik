import { describe, expect, it } from 'vitest';
import {
  resolveSameFileImportName,
  formatSameFileImport,
} from '../../../src/optimizer/segment/import-collection.js';

describe('resolveSameFileImportName', () => {
  const defaults = new Set(['def']);
  const renamed = new Map([['ren', 'renExported']]);

  it('binds a non-exported reexport through its _auto_ alias', () => {
    expect(resolveSameFileImportName('foo', true, defaults, renamed)).toBe('_auto_foo');
  });

  it('binds a default export through default', () => {
    expect(resolveSameFileImportName('def', false, defaults, renamed)).toBe('default');
  });

  it('binds a renamed export through its export name', () => {
    expect(resolveSameFileImportName('ren', false, defaults, renamed)).toBe('renExported');
  });

  it('binds a plain same-file symbol by its own name', () => {
    expect(resolveSameFileImportName('bar', false, defaults, renamed)).toBe('bar');
  });

  it('resolves the reexport arm regardless of default-set membership', () => {
    expect(resolveSameFileImportName('def', true, defaults, renamed)).toBe('_auto_def');
  });

  it('tolerates missing default/renamed maps', () => {
    expect(resolveSameFileImportName('bar', false, undefined, undefined)).toBe('bar');
  });
});

describe('formatSameFileImport', () => {
  it('emits a plain import when the imported name matches the local id', () => {
    expect(formatSameFileImport('foo', 'foo', './parent')).toBe('import { foo } from "./parent";');
  });

  it('emits an aliased import for _auto_ / default / renamed names', () => {
    expect(formatSameFileImport('foo', '_auto_foo', './parent')).toBe('import { _auto_foo as foo } from "./parent";');
    expect(formatSameFileImport('foo', 'default', './parent')).toBe('import { default as foo } from "./parent";');
    expect(formatSameFileImport('foo', 'renExported', './parent')).toBe('import { renExported as foo } from "./parent";');
  });
});
