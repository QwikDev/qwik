import { assert, describe, test } from 'vitest';
import { loadRoute } from './routing';
import type { MenuModuleLoader, ModuleLoader, RouteData } from './types';

// A minimal sync module loader for testing.
// Using a factory ensures each test gets a fresh loader to avoid MODULE_CACHE collisions.
const makeLoader = (): ModuleLoader => {
  const mod = { default: {} };
  return () => mod as any;
};

/**
 * Build a RouteData trie from a URL pattern like `/stuff/[param]` or `/[...rest]`. Each `[name]`
 * becomes a `_W` node and each `[...name]` becomes a `_A` node in the trie, with `_P` set to the
 * param name. Supports infix params like `pre[name]post`.
 */
function buildTree(pattern: string, loader = makeLoader()): RouteData {
  const parts = pattern
    .replace(/^\/|\/$/g, '')
    .split('/')
    .filter((p) => p.length > 0);
  const root: RouteData = {};

  if (parts.length === 0) {
    root._I = loader;
    return root;
  }

  let node: RouteData = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    let key: string;
    let paramName: string | undefined;
    let prefix: string | undefined;
    let suffix: string | undefined;

    const restMatch = /^\[\.\.\.(\w+)\]$/.exec(part);
    const infixMatch = restMatch ? null : /^(.*?)\[(\w+)\](.*?)$/.exec(part);

    if (restMatch) {
      key = '_A';
      paramName = restMatch[1];
    } else if (infixMatch) {
      key = '_W';
      paramName = infixMatch[2];
      prefix = infixMatch[1] || undefined;
      suffix = infixMatch[3] || undefined;
    } else {
      key = part.toLowerCase();
    }

    if (!node[key]) {
      (node[key] as RouteData) = {};
    }
    const child = node[key] as RouteData;
    if (paramName) {
      child._P = paramName;
    }
    if (prefix) {
      child._0 = prefix;
    }
    if (suffix) {
      child._9 = suffix;
    }
    if (isLast) {
      child._I = loader;
    }
    node = child;
  }

  return root;
}

// ─── Route matching tests ─────────────────────────────────────────────────────

const routeTests: Array<{
  pattern: string;
  pathname: string;
  result: Record<string, string>;
}> = [
  {
    pattern: '/stuff/[param]',
    pathname: '/stuff/thing',
    result: { param: 'thing' },
  },
  {
    pattern: '/stuff/[param]',
    pathname: '/stuff/thing/',
    result: { param: 'thing' },
  },
  {
    pattern: '/stuff/[...param]',
    pathname: '/stuff/a/b/c/',
    result: { param: 'a/b/c' },
  },
  {
    pattern: '/stuff/[...param]',
    pathname: '/stuff/a/b/c',
    result: { param: 'a/b/c' },
  },
  {
    pattern: '/stuff/[...param]',
    pathname: '/stuff/',
    result: { param: '' },
  },
  {
    pattern: '/stuff/[...param]',
    pathname: '/stuff',
    result: { param: '' },
  },
  {
    pattern: '/[...param]',
    pathname: '/thing/',
    result: { param: 'thing' },
  },
  {
    pattern: '/[...param]',
    pathname: '/thing',
    result: { param: 'thing' },
  },
  {
    pattern: '/xyz/[...param]',
    pathname: '/xyz/abc.dot',
    result: { param: 'abc.dot' },
  },
  {
    pattern: '/[...param]',
    pathname: '/abc.dot',
    result: { param: 'abc.dot' },
  },
  {
    pattern: '/[param]',
    pathname: '/abc.dot',
    result: { param: 'abc.dot' },
  },
  {
    pattern: '/xyz/[param]',
    pathname: '/xyz/abc.dot',
    result: { param: 'abc.dot' },
  },
];

describe('loadRoute — pattern matching', () => {
  for (const t of routeTests) {
    test(`${t.pattern} matches ${t.pathname}`, async () => {
      const routes = buildTree(t.pattern);
      const result = await loadRoute(routes, false, t.pathname);
      assert.isFalse(result.$notFound$, `Expected a match for ${t.pathname}`);
      assert.deepEqual(result.$params$, t.result);
    });
  }
});

// ─── Infix param tests ────────────────────────────────────────────────────────

describe('loadRoute — infix params', () => {
  test('pre[slug]post matches preHELLOpost', async () => {
    const routes = buildTree('/a/pre[slug]post');
    const result = await loadRoute(routes, false, '/a/preHELLOpost');
    assert.isFalse(result.$notFound$);
    assert.deepEqual(result.$params$, { slug: 'HELLO' });
  });

  test('pre[slug]post does not match empty value', async () => {
    const routes = buildTree('/a/pre[slug]post');
    const result = await loadRoute(routes, false, '/a/prepost');
    assert.isTrue(result.$notFound$);
  });

  test('[slug].json matches foo.json (suffix only)', async () => {
    const routes = buildTree('/api/[slug].json');
    const result = await loadRoute(routes, false, '/api/foo.json');
    assert.isFalse(result.$notFound$);
    assert.deepEqual(result.$params$, { slug: 'foo' });
  });

  test('prefix-only: img_[id] matches img_123', async () => {
    const routes = buildTree('/files/img_[id]');
    const result = await loadRoute(routes, false, '/files/img_123');
    assert.isFalse(result.$notFound$);
    assert.deepEqual(result.$params$, { id: '123' });
  });

  test('infix routeName is reconstructed correctly', async () => {
    const routes = buildTree('/a/pre[slug]post');
    const result = await loadRoute(routes, false, '/a/preVALUEpost');
    assert.equal(result.$routeName$, '/a/pre[slug]post');
  });

  test('infix is case-insensitive for prefix/suffix', async () => {
    const routes = buildTree('/a/Pre[slug]Post');
    const result = await loadRoute(routes, false, '/a/preVALUEpost');
    assert.isFalse(result.$notFound$);
    assert.deepEqual(result.$params$, { slug: 'VALUE' });
  });
});

// ─── Additional trie behaviour ─────────────────────────────────────────────────

test('loadRoute — exact static match', async () => {
  const routes = buildTree('/blog/posts');
  const result = await loadRoute(routes, false, '/blog/posts');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, {});
});

test('loadRoute — case-insensitive exact match', async () => {
  const routes = buildTree('/Blog/Posts');
  const result = await loadRoute(routes, false, '/BLOG/POSTS');
  assert.isFalse(result.$notFound$);
});

test('loadRoute — no match returns notFound=true', async () => {
  const routes = buildTree('/blog');
  const result = await loadRoute(routes, false, '/news');
  assert.isTrue(result.$notFound$);
});

test('loadRoute — root route matches /', async () => {
  const routes = buildTree('/');
  const result = await loadRoute(routes, false, '/');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, {});
});

test('loadRoute — loader paths are replaced by deeper matches', async () => {
  const routes: RouteData = {
    _R: ['shared-loader'],
    products: {
      _W: {
        _P: 'id',
        _R: ['shared-loader'],
        view: {
          _I: makeLoader(),
        },
      },
    },
  };

  const result = await loadRoute(routes, false, '/products/123/view');

  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$loaderPaths$, {
    'shared-loader': '/products/123/',
  });
});

test('loadRoute — miss renders the nearest _4 inside gathered layouts', async () => {
  const rootLayout = { default: () => 'layout' };
  const notFound = { default: () => 'not-found' };
  const routes: RouteData = {
    _L: () => rootLayout as any,
    _4: () => notFound as any,
    blog: buildTree('/blog'),
  };
  const result = await loadRoute(routes, false, '/does-not-exist');
  assert.isTrue(result.$notFound$);
  // Gathered root layout + the 404 module, no wrapper.
  assert.deepEqual(result.$mods$, [rootLayout, notFound]);
});

test('loadRoute — miss renders _4; _E remains the thrown-error loader', async () => {
  const errorSentinel = { default: () => 'error-handler' };
  const notFoundSentinel = { default: () => '404-handler' };
  const errorLoader: ModuleLoader = () => errorSentinel as any;
  const notFoundLoader: ModuleLoader = () => notFoundSentinel as any;
  const routes: RouteData = {
    _E: errorLoader,
    _4: notFoundLoader,
    blog: buildTree('/blog'),
  };
  const result = await loadRoute(routes, false, '/does-not-exist');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [notFoundSentinel]);
  assert.equal(result.$errorLoader$, errorLoader);
});

test('loadRoute — deeper _4 wins and renders in its own layouts', async () => {
  const rootLayout = { default: () => 'root-layout' };
  const blogLayout = { default: () => 'blog-layout' };
  const blogNotFound = { default: () => 'blog-404' };
  const routes: RouteData = {
    _L: () => rootLayout as any,
    _4: () => ({ default: () => 'root-404' }) as any,
    blog: {
      _L: () => blogLayout as any,
      _4: () => blogNotFound as any,
      _W: { _P: 'slug', _I: makeLoader() },
    },
  };
  // /blog/missing/extra dead-ends under blog; blog's _4 renders in its own [root, blog] layouts.
  const result = await loadRoute(routes, false, '/blog/missing/extra');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [rootLayout, blogLayout, blogNotFound]);
});

test('loadRoute — a bare _4 renders in its own layouts, not a deeper sibling layout', async () => {
  // Root 404; /blog has its own layout. A miss under /blog renders the root 404 in the root layout
  // only — never wrapped in /blog's layout, which the root 404 is not nested under.
  const rootLayout = { default: () => 'root-layout' };
  const blogLayout = { default: () => 'blog-layout' };
  const root404 = { default: () => 'root-404' };
  const routes: RouteData = {
    _L: () => rootLayout as any,
    _4: () => root404 as any,
    blog: { _L: () => blogLayout as any },
  };
  const result = await loadRoute(routes, false, '/blog/nonexistent');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [rootLayout, root404]);
});

test('loadRoute — a mid-tree _4 excludes layouts from directories deeper than itself', async () => {
  const rootLayout = { default: () => 'root-layout' };
  const aLayout = { default: () => 'a-layout' };
  const bLayout = { default: () => 'b-layout' };
  const a404 = { default: () => 'a-404' };
  const routes: RouteData = {
    _L: () => rootLayout as any,
    a: {
      _L: () => aLayout as any,
      _4: () => a404 as any,
      b: { _L: () => bLayout as any },
    },
  };
  // /a/b/missing dead-ends under b; the nearest 404 (a's) renders in [root, a] — never b's layout.
  const result = await loadRoute(routes, false, '/a/b/missing');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [rootLayout, aLayout, a404]);
});

test('loadRoute — miss with no layouts renders just the 404 module', async () => {
  const sentinel = { default: () => 'not-found' };
  const routes: RouteData = {
    _4: () => sentinel as any,
  };
  const result = await loadRoute(routes, false, '/anything');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [sentinel]);
});

test('loadRoute — miss falls back to _E when there is no _4', async () => {
  const errorSentinel = { default: () => 'error-handler' };
  const errorLoader: ModuleLoader = () => errorSentinel as any;
  const routes: RouteData = {
    _E: errorLoader,
    blog: buildTree('/blog'),
  };
  const result = await loadRoute(routes, false, '/does-not-exist');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [errorSentinel]);
  assert.equal(result.$errorLoader$, errorLoader);
});

test('loadRoute — an override-chain _4 (404@layout / 404!) is used as-is, ignoring gathered _L', async () => {
  const gatheredLayout = makeLoader();
  const pickedLayout = { default: () => 'picked' };
  const notFound = { default: () => 'not-found' };
  const routes: RouteData = {
    _L: gatheredLayout,
    // _4 as an override array: the complete chain, so the gathered root _L is not prepended.
    _4: [() => pickedLayout as any, () => notFound as any],
  };
  const result = await loadRoute(routes, false, '/missing');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [pickedLayout, notFound]);
});

test('loadRoute — a 404 inside a pathless root group is found on a top-level miss', async () => {
  // routes/(app)/{layout,index,404}.tsx → the 404 lives in root._M[0]._4, not root._4. A top-level
  // miss that never descends into the group must still render it, wrapped in the group's layout.
  const appLayout = { default: () => 'app-layout' };
  const app404 = { default: () => 'app-404' };
  const routes: RouteData = {
    _M: [{ _L: () => appLayout as any, _4: () => app404 as any, _I: makeLoader() }],
  };
  const result = await loadRoute(routes, false, '/totally-missing');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [appLayout, app404]);
});

test('loadRoute — a 404 in a nested pathless group is recovered with all its group layouts', async () => {
  const aLayout = { default: () => 'a-layout' };
  const bLayout = { default: () => 'b-layout' };
  const nested404 = { default: () => 'nested-404' };
  const routes: RouteData = {
    _M: [
      { _L: () => aLayout as any, _M: [{ _L: () => bLayout as any, _4: () => nested404 as any }] },
    ],
  };
  const result = await loadRoute(routes, false, '/missing');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [aLayout, bLayout, nested404]);
});

test('loadRoute — a root-group 404 is found on a miss that dead-ends inside an ungrouped sibling', async () => {
  // routes/(app)/404.tsx (root group) + routes/blog/ (sibling OUTSIDE the group). A miss under /blog
  // dead-ends at `blog`, which has no group — but the (app) group is URL-transparent, so its 404 is
  // the root 404 and must still render. (Regression: recovery only searched the dead-end node.)
  const appLayout = { default: () => 'app-layout' };
  const app404 = { default: () => 'app-404' };
  const routes: RouteData = {
    _M: [{ _L: () => appLayout as any, _4: () => app404 as any, _I: makeLoader() }],
    blog: { _I: makeLoader() },
  };
  const result = await loadRoute(routes, false, '/blog/missing');
  assert.isTrue(result.$notFound$);
  assert.deepEqual(result.$mods$, [appLayout, app404]);
});

test('loadRoute — ErrorLoader passed through on matched routes', async () => {
  const errorSentinel = { default: () => 'error-handler' };
  const errorLoader: ModuleLoader = () => errorSentinel as any;
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _E: errorLoader,
    blog: {
      _I: pageLoader,
    },
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  assert.equal(result.$errorLoader$, errorLoader);
});

test('loadRoute — routeName is constructed from matched path parts', async () => {
  const routes = buildTree('/blog/[slug]');
  const result = await loadRoute(routes, false, '/blog/my-post');
  assert.isFalse(result.$notFound$);
  assert.equal(result.$routeName$, '/blog/[slug]');
});

test('loadRoute — rest param captures all remaining segments', async () => {
  const routes = buildTree('/docs/[...path]');
  const result = await loadRoute(routes, false, '/docs/a/b/c/d');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, { path: 'a/b/c/d' });
});

// ─── Layout accumulation tests ──────────────────────────────────────────────────

test('loadRoute — _L accumulated from ancestors', async () => {
  const rootLayout = makeLoader();
  const blogLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _L: rootLayout,
    blog: {
      _L: blogLayout,
      _W: {
        _P: 'slug',
        _I: pageLoader,
      },
    },
  };
  const result = await loadRoute(routes, false, '/blog/my-post');
  assert.isFalse(result.$notFound$);
  // Should have rootLayout, blogLayout, pageLoader
  assert.equal(result.$mods$.length, 3);
});

test('loadRoute — _I array overrides gathered layouts', async () => {
  const rootLayout = makeLoader();
  const customLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _L: rootLayout,
    blog: {
      // _I as array = layout stop override, ignores gathered _L
      _I: [customLayout, pageLoader],
    },
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  // Only the 2 loaders from the array, NOT rootLayout
  assert.equal(result.$mods$.length, 2);
});

// ─── Rewrite (_G) tests ────────────────────────────────────────────────────────

test('loadRoute — _G static rewrite resolves target loaders', async () => {
  const rootLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _L: rootLayout,
    about: {
      _I: pageLoader,
    },
    es: {
      'acerca-de': {
        _G: '/about/',
      },
    },
  };
  const result = await loadRoute(routes, false, '/es/acerca-de');
  assert.isFalse(result.$notFound$);
  // Should load rootLayout + pageLoader from the /about/ target
  assert.equal(result.$mods$.length, 2);
});

test('loadRoute — _G with params preserves captured params', async () => {
  const pageLoader = makeLoader();
  const routes: RouteData = {
    blog: {
      _W: {
        _P: 'slug',
        _I: pageLoader,
      },
    },
    es: {
      blog: {
        _W: {
          _P: 'slug',
          _G: '/blog/_W/',
        },
      },
    },
  };
  const result = await loadRoute(routes, false, '/es/blog/my-post');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, { slug: 'my-post' });
});

test('loadRoute — _G empty string rewrite resolves prefix root to index', async () => {
  const rootLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _L: rootLayout,
    _M: [
      {
        _I: pageLoader,
      },
    ],
    en: {
      _G: '',
    },
    de: {
      _G: '',
    },
  };
  const resultEn = await loadRoute(routes, false, '/en');
  assert.isFalse(resultEn.$notFound$);
  assert.equal(resultEn.$mods$.length, 2); // rootLayout + pageLoader

  const resultDe = await loadRoute(routes, false, '/de');
  assert.isFalse(resultDe.$notFound$);
  assert.equal(resultDe.$mods$.length, 2);
});

test('loadRoute — _G target not found returns 404', async () => {
  const routes: RouteData = {
    es: {
      about: {
        _G: '/nonexistent/',
      },
    },
  };
  const result = await loadRoute(routes, false, '/es/about');
  assert.isTrue(result.$notFound$);
});

// ─── Group (_M) tests ───────────────────────────────────────────────────────────

test('loadRoute — _M group: index inside group matches root /', async () => {
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _I: pageLoader,
      },
    ],
  };
  const result = await loadRoute(routes, false, '/');
  assert.isFalse(result.$notFound$);
});

test('loadRoute — _M group: layout in group is NOT duplicated', async () => {
  const groupLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _L: groupLayout,
        _I: pageLoader,
      },
    ],
  };
  const result = await loadRoute(routes, false, '/');
  assert.isFalse(result.$notFound$);
  // Should have groupLayout + pageLoader = 2 modules, NOT 3 (no duplication)
  assert.equal(result.$mods$.length, 2);
});

test('loadRoute — _M group: child route found inside group', async () => {
  const groupLayout = makeLoader();
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _L: groupLayout,
        blog: {
          _I: pageLoader,
        },
      },
    ],
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  // groupLayout + pageLoader
  assert.equal(result.$mods$.length, 2);
});

// ─── Rest wildcard fallback tests ────────────────────────────────────────────────

test('loadRoute — _A fallback when _W matches but leads to dead end', async () => {
  const catchallLoader = makeLoader();
  const cityLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _A: { _P: 'catchall', _I: catchallLoader },
        _W: { _P: 'country', _W: { _P: 'city', _I: cityLoader } },
      },
    ],
  };
  // /catchall/ should match _A (rest wildcard), not _W (which needs 2 segments)
  const result = await loadRoute(routes, false, '/catchall');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, { catchall: 'catchall' });
});

test('loadRoute — _W preferred over _A when full path matches', async () => {
  const catchallLoader = makeLoader();
  const cityLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _A: { _P: 'catchall', _I: catchallLoader },
        _W: { _P: 'country', _W: { _P: 'city', _I: cityLoader } },
      },
    ],
  };
  // /US/NYC should match _W chain (country/city), not _A
  const result = await loadRoute(routes, false, '/US/NYC');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, { country: 'US', city: 'NYC' });
});

test('loadRoute — _A fallback with multi-segment rest value', async () => {
  const catchallLoader = makeLoader();
  const routes: RouteData = {
    _A: { _P: 'rest', _I: catchallLoader },
    _W: { _P: 'section', _W: { _P: 'slug' } }, // no _I on slug — dead end
  };
  // /blog/post/extra — _W matches but no _I, fallback to _A
  const result = await loadRoute(routes, false, '/blog/post/extra');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$params$, { rest: 'blog/post/extra' });
});

test('loadRoute — exact child dead end does not fall back to sibling _M catchall', async () => {
  const catchallLoader = makeLoader();
  const routes: RouteData = {
    _4: makeLoader(),
    _M: [
      {
        _A: { _P: 'catchall', _I: catchallLoader },
      },
    ],
    'loader-redirect': {
      source: {
        _I: makeLoader(),
      },
    },
  };

  const result = await loadRoute(routes, false, '/loader-redirect/notexist');
  assert.isTrue(result.$notFound$);
  assert.notDeepEqual(result.$params$, { catchall: 'loader-redirect/notexist' });
});

// ─── Menu (_N) trie tests ───────────────────────────────────────────────────────

test('loadRoute — _N menu from ancestor is used for child route', async () => {
  const menuLoader: MenuModuleLoader = async () => ({ default: { text: 'Docs Menu' } });
  const pageLoader = makeLoader();
  const routes: RouteData = {
    docs: {
      _N: menuLoader,
      intro: {
        _I: pageLoader,
      },
    },
  };
  const result = await loadRoute(routes, false, '/docs/intro');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$menu$, { text: 'Docs Menu' });
});

test('loadRoute — deeper _N overrides ancestor _N', async () => {
  const rootMenu: MenuModuleLoader = async () => ({ default: { text: 'Root' } });
  const docsMenu: MenuModuleLoader = async () => ({ default: { text: 'Docs' } });
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _N: rootMenu,
    docs: {
      _N: docsMenu,
      intro: {
        _I: pageLoader,
      },
    },
  };
  const result = await loadRoute(routes, false, '/docs/intro');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$menu$, { text: 'Docs' });
});

test('loadRoute — root _N used when no deeper menu exists', async () => {
  const rootMenu: MenuModuleLoader = async () => ({ default: { text: 'Root' } });
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _N: rootMenu,
    blog: {
      _I: pageLoader,
    },
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$menu$, { text: 'Root' });
});

test('loadRoute — no _N means no menu', async () => {
  const pageLoader = makeLoader();
  const routes: RouteData = {
    blog: {
      _I: pageLoader,
    },
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  assert.isUndefined(result.$menu$);
});

test('loadRoute — _N in _M group is picked up', async () => {
  const menuLoader: MenuModuleLoader = async () => ({ default: { text: 'Group Menu' } });
  const pageLoader = makeLoader();
  const routes: RouteData = {
    _M: [
      {
        _N: menuLoader,
        blog: {
          _I: pageLoader,
        },
      },
    ],
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isFalse(result.$notFound$);
  assert.deepEqual(result.$menu$, { text: 'Group Menu' });
});

// ─── Empty node tests ─────────────────────────────────────────────────────────

test('loadRoute — empty object leaf node is a 404 (no false match)', async () => {
  // Simulates a trie with a directory that has no route files — the serializer
  // should prune these, but if one slips through, the runtime must not treat it
  // as a valid match.
  const routes: RouteData = {
    blog: {}, // empty leaf — no _I, no _L, nothing
  };
  const result = await loadRoute(routes, false, '/blog');
  assert.isTrue(result.$notFound$);
});

test('loadRoute — empty intermediate node still finds deeper routes', async () => {
  const pageLoader = makeLoader();
  const routes: RouteData = {
    docs: {
      // no _I or _L here — just a passthrough directory
      guide: {
        _I: pageLoader,
      },
    },
  };
  const result = await loadRoute(routes, false, '/docs/guide');
  assert.isFalse(result.$notFound$);
  assert.equal(result.$mods$.length, 1);
});

test('loadRoute — empty _M group is ignored', async () => {
  const routes: RouteData = {
    _M: [{}], // empty group — no routes, no layouts
  };
  const result = await loadRoute(routes, false, '/anything');
  assert.isTrue(result.$notFound$);
});
