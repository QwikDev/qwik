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
    // The original OSS-383 brand spec implied an 11-char-strict shape;
    // OSS-384 loosened the validator to match the peer-tool input class
    // the inlinedQrl parser accepts at runtime. The strict-rejection
    // assertions here cover the values that *must still* be rejected.
    expect(() => mkHash('')).toThrow();
    expect(() => mkHash('contains-dash')).toThrow();
    expect(() => mkHash('has space123')).toThrow();
  });

  it('accepts peer-tool hash slots loosened to match the inlinedQrl parser', () => {
    // OSS-384 widened the brand to accept everything the extraction parser
    // pushes through: short alphanumeric names (e.g. "task"), and the
    // fallback case where the whole symbol name (with underscores) becomes
    // the hash slot when no `_<hash>` suffix is parseable.
    expect(mkHash('task')).toBe('task');
    expect(mkHash('AaBbCcDd')).toBe('AaBbCcDd');
    expect(mkHash('waytoolongahashvalue')).toBe('waytoolongahashvalue');
    expect(mkHash('Foo_component_bbb')).toBe('Foo_component_bbb');
  });

  it('still rejects whitespace and non-identifier separators after the loosening', () => {
    expect(() => mkHash('contains.dot')).toThrow();
    expect(() => mkHash('with/slash')).toThrow();
    expect(() => mkHash('  ')).toThrow();
  });
});

describe('mkCanonicalFilename', () => {
  it('accepts valid identifier shapes', () => {
    expect(mkCanonicalFilename('test_tsx_renderHeader1_jMxQsjbyDss')).toBe(
      'test_tsx_renderHeader1_jMxQsjbyDss',
    );
  });

  it('rejects values with non-identifier characters', () => {
    // OSS-384 loosened the validator to non-empty-only (production values
    // include bracket-routes and digit-leading filenames). The strict-
    // rejection cases preserved here are values that must remain rejected:
    // empty strings. Non-empty arbitrary input is accepted by design now.
    expect(() => mkCanonicalFilename('')).toThrow();
  });

  it('accepts real-world dotted, bracket-route, and digit-leading values', () => {
    // After OSS-384, the brand admits the actual production-emitted shapes.
    expect(mkCanonicalFilename('test.tsx_renderHeader1_jMxQsjbyDss')).toBe(
      'test.tsx_renderHeader1_jMxQsjbyDss',
    );
    expect(mkCanonicalFilename('test.spec.tsx_Foo_jMxQsjbyDss')).toBe(
      'test.spec.tsx_Foo_jMxQsjbyDss',
    );
    expect(mkCanonicalFilename('[[...slug]].tsx_slug_component_AaBbCcDdEeF')).toBe(
      '[[...slug]].tsx_slug_component_AaBbCcDdEeF',
    );
    expect(mkCanonicalFilename('404.tsx__404_component_AaBbCcDdEeF')).toBe(
      '404.tsx__404_component_AaBbCcDdEeF',
    );
  });
});

describe('mkDisplayName', () => {
  it('accepts valid identifier shapes', () => {
    expect(mkDisplayName('Foo_component')).toBe('Foo_component');
  });

  it('rejects invalid shapes', () => {
    // OSS-384 loosened mkDisplayName to non-empty-only (production values
    // include bracket-routes and digit-leading filenames). The empty case
    // is the only one that remains rejected.
    expect(() => mkDisplayName('')).toThrow();
  });

  it('accepts real-world dotted, bracket-route, and digit-leading values', () => {
    expect(mkDisplayName('test.tsx_renderHeader1')).toBe('test.tsx_renderHeader1');
    expect(mkDisplayName('test.spec.tsx_Foo')).toBe('test.spec.tsx_Foo');
    expect(mkDisplayName('foo.mjs_bar')).toBe('foo.mjs_bar');
    expect(mkDisplayName('[[...slug]].tsx_slug_component')).toBe(
      '[[...slug]].tsx_slug_component',
    );
    expect(mkDisplayName('404.tsx__404_component')).toBe('404.tsx__404_component');
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

  it('accepts bare `$` standalone (OSS-385)', () => {
    // The bare-`$()` marker's ctxName is literally '$' in production —
    // see `tests/optimizer/extract.test.ts` for the contract. The
    // OSS-383 regex was too strict; OSS-385 loosened it.
    expect(mkCtxName('$')).toBe('$');
  });

  it('accepts hyphenated JSX attribute names (OSS-385)', () => {
    // JSX accepts dashed attribute names and convergence fixtures emit
    // them as ctxName values (e.g. `on-cLick$` in `example_jsx_listeners`).
    expect(mkCtxName('on-cLick$')).toBe('on-cLick$');
    expect(mkCtxName('aria-label$')).toBe('aria-label$');
    expect(mkCtxName('data-foo$')).toBe('data-foo$');
  });

  it('rejects invalid shapes', () => {
    expect(() => mkCtxName('')).toThrow();
    expect(() => mkCtxName('$leading')).toThrow();
    expect(() => mkCtxName('1leading')).toThrow();
    expect(() => mkCtxName('has space$')).toThrow();
    expect(() => mkCtxName('-leading-dash')).toThrow();
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
