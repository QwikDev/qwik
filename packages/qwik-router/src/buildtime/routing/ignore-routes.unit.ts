import { assert, test } from 'vitest';
import { createIgnoreMatcher } from './ignore-routes';

const cases: { pattern: string; ignored: string[]; kept: string[] }[] = [
  {
    // A trailing `**` also matches the folder itself, so its subtree is never read.
    pattern: 'dev/**',
    ignored: ['dev', 'dev/index.tsx', 'dev/gallery/index.tsx'],
    kept: ['development', 'blog/dev/index.tsx', 'devil.tsx'],
  },
  {
    pattern: '**/dev/**',
    ignored: ['dev', 'dev/index.tsx', 'blog/dev', 'a/b/dev/index.tsx'],
    kept: ['development/index.tsx', 'blog/index.tsx'],
  },
  {
    pattern: 'dev',
    ignored: ['dev'],
    kept: ['dev/index.tsx', 'development'],
  },
  {
    pattern: 'dev/*',
    ignored: ['dev/index.tsx', 'dev/gallery'],
    kept: ['dev', 'dev/gallery/index.tsx'],
  },
  {
    // Route characters are literal, so patterns look like the folder tree.
    pattern: '(admin)/**',
    ignored: ['(admin)', '(admin)/users/index.tsx'],
    kept: ['admin', 'admin/index.tsx', 'xadmin'],
  },
  {
    pattern: 'blog/[slug]/**',
    ignored: ['blog/[slug]', 'blog/[slug]/index.tsx'],
    kept: ['blog/hello/index.tsx', 'blog/[id]/index.tsx'],
  },
  {
    pattern: '[...rest]/**',
    ignored: ['[...rest]', '[...rest]/index.tsx'],
    kept: ['rest/index.tsx'],
  },
  {
    pattern: 'a/**/b',
    ignored: ['a/b', 'a/x/b', 'a/x/y/b'],
    kept: ['a', 'a/x', 'a/b/c'],
  },
  {
    pattern: '{dev,debug}/**',
    ignored: ['dev/index.tsx', 'debug/index.tsx'],
    kept: ['devdebug/index.tsx'],
  },
  {
    pattern: 'issue?/**',
    ignored: ['issue1/index.tsx', 'issueA'],
    kept: ['issue/index.tsx', 'issue12/index.tsx'],
  },
  {
    // Case-insensitive, matching how route segments become lowercase URLs.
    pattern: 'DEV/**',
    ignored: ['dev/index.tsx', 'Dev'],
    kept: ['development'],
  },
  {
    // Used as written: no normalisation, so these match nothing and get reported.
    pattern: './dev/**',
    ignored: [],
    kept: ['dev', 'dev/index.tsx'],
  },
  {
    pattern: '/dev/**',
    ignored: [],
    kept: ['dev', 'dev/index.tsx'],
  },
  {
    pattern: '*/fixtures/**',
    ignored: ['blog/fixtures', 'blog/fixtures/index.tsx'],
    kept: ['fixtures/index.tsx', 'a/b/fixtures/index.tsx'],
  },
  {
    pattern: '**/__fixtures__/**',
    ignored: ['__fixtures__', 'blog/__fixtures__/index.tsx', 'a/b/__fixtures__'],
    kept: ['fixtures/index.tsx'],
  },
  {
    pattern: 'blog/[slug]/preview/**',
    ignored: ['blog/[slug]/preview', 'blog/[slug]/preview/index.tsx'],
    kept: ['blog/[slug]/index.tsx', 'blog/hello/preview/index.tsx'],
  },
  {
    pattern: '{dev,playground}/**',
    ignored: ['dev/index.tsx', 'playground/index.tsx'],
    kept: ['devplayground/index.tsx'],
  },
  {
    pattern: 'debug.tsx',
    ignored: ['debug.tsx'],
    kept: ['debugatsx', 'a/debug.tsx'],
  },
];

for (const c of cases) {
  test(`ignoreRoutes pattern "${c.pattern}"`, () => {
    for (const path of c.ignored) {
      const matcher = createIgnoreMatcher([c.pattern])!;
      assert.equal(matcher.isIgnored(path), true, `"${c.pattern}" should ignore "${path}"`);
    }
    for (const path of c.kept) {
      const matcher = createIgnoreMatcher([c.pattern])!;
      assert.equal(matcher.isIgnored(path), false, `"${c.pattern}" should keep "${path}"`);
    }
  });
}

test('no patterns means no matcher', () => {
  assert.equal(createIgnoreMatcher([]), null);
  assert.equal(createIgnoreMatcher(undefined), null);
});

test('unusedPatterns reports every pattern that never matched', () => {
  const matcher = createIgnoreMatcher(['dev/**', 'typo/**', '(admin)/**'])!;
  matcher.isIgnored('dev/index.tsx');
  matcher.isIgnored('(admin)/index.tsx');
  assert.deepEqual(matcher.unusedPatterns(), ['typo/**']);
});

test('overlapping patterns all count as used', () => {
  const matcher = createIgnoreMatcher(['dev/**', '**/dev/**'])!;
  assert.equal(matcher.isIgnored('dev/index.tsx'), true);
  assert.deepEqual(matcher.unusedPatterns(), []);
});
