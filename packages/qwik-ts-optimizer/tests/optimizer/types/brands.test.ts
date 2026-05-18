/**
 * Runtime unit tests for the brand smart constructors in
 * `src/optimizer/types/brands.ts`. Each brand gets accept-case +
 * reject-case coverage.
 *
 * Compile-time enforcement (type-level non-interchangeability) lives in
 * the sibling `brands.compile-test.ts` — those assertions can't run at
 * runtime; they fail the typecheck instead.
 */

import { describe, it, expect } from 'vitest';
import {
  mkSymbolName,
  mkHash,
  mkCanonicalFilename,
  mkDisplayName,
  mkCtxName,
  mkOrigin,
  mkRelativePath,
  mkFilePath,
  mkSourceText,
  mkBodyText,
  mkByteOffset,
  mkLineNumber,
  mkColumnNumber,
} from '../../../src/optimizer/types/brands.js';

describe('mkSymbolName', () => {
  it('accepts valid identifier shapes', () => {
    expect(mkSymbolName('foo')).toBe('foo');
    expect(mkSymbolName('renderHeader1_jMxQsjbyDss')).toBe('renderHeader1_jMxQsjbyDss');
    expect(mkSymbolName('_private')).toBe('_private');
    expect(mkSymbolName('$dollar')).toBe('$dollar');
    expect(mkSymbolName('s_abc123')).toBe('s_abc123');
  });

  it('rejects invalid identifier shapes', () => {
    expect(() => mkSymbolName('')).toThrow();
    expect(() => mkSymbolName('foo bar')).toThrow();
    expect(() => mkSymbolName('1foo')).toThrow();
    expect(() => mkSymbolName('foo.bar')).toThrow();
    expect(() => mkSymbolName('foo-bar')).toThrow();
    expect(() => mkSymbolName('foo!')).toThrow();
  });
});

describe('mkHash', () => {
  it('accepts 11-char base64url-safe hashes', () => {
    expect(mkHash('jMxQsjbyDss')).toBe('jMxQsjbyDss');
    expect(mkHash('USi8k1jUb40')).toBe('USi8k1jUb40');
    expect(mkHash('Ay6ibkfFYsw')).toBe('Ay6ibkfFYsw');
    expect(mkHash('00000000000')).toBe('00000000000');
  });

  it('rejects non-11-char or non-alphanumeric inputs', () => {
    expect(() => mkHash('')).toThrow();
    expect(() => mkHash('tooshort')).toThrow();
    expect(() => mkHash('waytoolongahashvalue')).toThrow();
    expect(() => mkHash('contains-dash')).toThrow();
    expect(() => mkHash('contains_unde')).toThrow();
    expect(() => mkHash('has space123')).toThrow();
  });
});

describe('mkCanonicalFilename', () => {
  it('accepts valid identifier shapes', () => {
    expect(mkCanonicalFilename('test_tsx_renderHeader1_jMxQsjbyDss')).toBe(
      'test_tsx_renderHeader1_jMxQsjbyDss',
    );
  });

  it('rejects values with non-identifier characters', () => {
    expect(() => mkCanonicalFilename('')).toThrow();
    expect(() => mkCanonicalFilename('test.tsx_renderHeader1')).toThrow();
    expect(() => mkCanonicalFilename('with/slash')).toThrow();
  });
});

describe('mkDisplayName', () => {
  it('accepts valid identifier shapes', () => {
    expect(mkDisplayName('Foo_component')).toBe('Foo_component');
  });

  it('rejects invalid shapes', () => {
    expect(() => mkDisplayName('')).toThrow();
    expect(() => mkDisplayName('1leading-digit')).toThrow();
  });
});

describe('mkCtxName', () => {
  it('accepts marker callee names (with and without $)', () => {
    expect(mkCtxName('component$')).toBe('component$');
    expect(mkCtxName('useTask$')).toBe('useTask$');
    expect(mkCtxName('useStyles$')).toBe('useStyles$');
    expect(mkCtxName('component')).toBe('component');
    expect(mkCtxName('componentQrl')).toBe('componentQrl');
  });

  it('accepts JSX attribute names including namespaced and bind:', () => {
    expect(mkCtxName('onClick$')).toBe('onClick$');
    expect(mkCtxName('document:onScroll$')).toBe('document:onScroll$');
    expect(mkCtxName('window:onResize$')).toBe('window:onResize$');
    expect(mkCtxName('bind:value$')).toBe('bind:value$');
  });

  it('rejects invalid shapes', () => {
    expect(() => mkCtxName('')).toThrow();
    expect(() => mkCtxName('$leading')).toThrow();
    expect(() => mkCtxName('1leading')).toThrow();
    expect(() => mkCtxName('has space$')).toThrow();
    expect(() => mkCtxName('has-dash$')).toThrow();
    expect(() => mkCtxName('foo$bar$')).toThrow();
  });
});

describe('mkOrigin', () => {
  it('accepts any non-empty string', () => {
    expect(mkOrigin('test.tsx')).toBe('test.tsx');
    expect(mkOrigin('/abs/path/file.ts')).toBe('/abs/path/file.ts');
  });

  it('rejects empty string', () => {
    expect(() => mkOrigin('')).toThrow();
  });
});

describe('mkRelativePath', () => {
  it('accepts relative paths', () => {
    expect(mkRelativePath('src/foo.ts')).toBe('src/foo.ts');
    expect(mkRelativePath('./foo.ts')).toBe('./foo.ts');
    expect(mkRelativePath('foo.ts')).toBe('foo.ts');
  });

  it('rejects empty and absolute paths', () => {
    expect(() => mkRelativePath('')).toThrow();
    expect(() => mkRelativePath('/abs/foo.ts')).toThrow();
  });
});

describe('mkFilePath', () => {
  it('accepts well-formed paths', () => {
    expect(mkFilePath('/abs/foo.ts')).toBe('/abs/foo.ts');
    expect(mkFilePath('src/foo.ts')).toBe('src/foo.ts');
  });

  it('rejects empty or doubled separators', () => {
    expect(() => mkFilePath('')).toThrow();
    expect(() => mkFilePath('src//foo.ts')).toThrow();
    expect(() => mkFilePath('//net/share')).toThrow();
  });
});

describe('mkSourceText / mkBodyText (pass-through)', () => {
  it('accepts any string, including empty', () => {
    expect(mkSourceText('')).toBe('');
    expect(mkSourceText('const x = 1;')).toBe('const x = 1;');
    expect(mkBodyText('')).toBe('');
    expect(mkBodyText('() => { return <div/>; }')).toBe('() => { return <div/>; }');
  });
});

describe('mkByteOffset / mkLineNumber / mkColumnNumber', () => {
  it('accepts non-negative integers', () => {
    expect(mkByteOffset(0)).toBe(0);
    expect(mkByteOffset(42)).toBe(42);
    expect(mkLineNumber(1)).toBe(1);
    expect(mkColumnNumber(0)).toBe(0);
  });

  it('rejects negative, non-integer, or NaN', () => {
    expect(() => mkByteOffset(-1)).toThrow();
    expect(() => mkByteOffset(1.5)).toThrow();
    expect(() => mkByteOffset(NaN)).toThrow();
    expect(() => mkByteOffset(Infinity)).toThrow();
    expect(() => mkLineNumber(-1)).toThrow();
    expect(() => mkColumnNumber(1.1)).toThrow();
  });
});
