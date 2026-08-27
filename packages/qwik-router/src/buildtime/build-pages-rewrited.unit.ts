import { assert } from 'vitest';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Pages Rewrited', {
  rewriteRoutes: [
    {
      paths: {
        docs: 'documentazione',
        'getting-started': 'per-iniziare',
        'about-us': 'informazioni',
        products: 'prodotti',
      },
    },
    {
      prefix: 'it',
      paths: {
        docs: 'documentazione',
        'getting-started': 'per-iniziare',
        'about-us': 'informazioni',
        products: 'prodotti',
      },
    },
  ],
});

test('translated pathname / with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/');
  assert.deepEqual(r.id, 'CommonRouteIT');
  assert.deepEqual(r.pathname, '/it/');
  assert.deepEqual(r.routeName, 'it/');
  assert.deepEqual(r.pattern, /^\/it\/$/);
  assert.deepEqual(r.paramNames.length, 0);
  assert.deepEqual(r.segments[0][0].content, 'it');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/layout.tsx'
    )
  );
  assert.ok(r.filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/index.tsx'));
});

test('translated pathname /docs/getting-started with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/documentazione/per-iniziare/');
  assert.deepEqual(r.id, 'DocsGettingstartedRouteIT');
  assert.deepEqual(r.pathname, '/it/documentazione/per-iniziare/');
  assert.deepEqual(r.routeName, 'it/documentazione/per-iniziare/');
  assert.deepEqual(r.pattern, /^\/it\/documentazione\/per-iniziare\/?/);
  assert.deepEqual(r.paramNames.length, 0);
  assert.deepEqual(r.segments[0][0].content, 'it');
  assert.deepEqual(r.segments[1][0].content, 'documentazione');
  assert.deepEqual(r.segments[2][0].content, 'per-iniziare');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/getting-started/index.md'
    )
  );
});

test('translated pathname /docs/[category]/[id] with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/documentazione/[category]/[id]/');
  assert.deepEqual(r.id, 'DocsCategoryIdRouteIT');
  assert.deepEqual(r.pathname, '/it/documentazione/[category]/[id]/');
  assert.deepEqual(r.routeName, 'it/documentazione/[category]/[id]/');
  assert.deepEqual(r.pattern, /^\/it\/documentazione\/([^/]+?)\/([^/]+?)\/?/);
  assert.deepEqual(r.paramNames[0], 'category');
  assert.deepEqual(r.paramNames[1], 'id');
  assert.deepEqual(r.segments[0][0].content, 'it');
  assert.deepEqual(r.segments[1][0].content, 'documentazione');
  assert.deepEqual(r.segments[2][0].content, 'category');
  assert.deepEqual(r.segments[3][0].content, 'id');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/[category]/[id]/index.tsx'
    )
  );
});

test('translated pathname /about-us with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/informazioni/');
  assert.deepEqual(r.id, 'CommonAboutusRouteIT');
  assert.deepEqual(r.pathname, '/it/informazioni/');
  assert.deepEqual(r.routeName, 'it/informazioni/');
  assert.deepEqual(r.pattern, /^\/it\/informazioni\/?/);
  assert.deepEqual(r.paramNames.length, 0);
  assert.deepEqual(r.segments[0][0].content, 'it');
  assert.deepEqual(r.segments[1][0].content, 'informazioni');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/layout.tsx'
    )
  );
  assert.ok(
    r.filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/about-us/index.tsx')
  );
});

test('translated pathname /products/[id] with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/prodotti/[id]/');
  assert.deepEqual(r.id, 'CommonProductsIdRouteIT');
  assert.deepEqual(r.pathname, '/it/prodotti/[id]/');
  assert.deepEqual(r.routeName, 'it/prodotti/[id]/');
  assert.deepEqual(r.pattern, /^\/it\/prodotti\/([^/]+?)\/?/);
  assert.deepEqual(r.paramNames[0], 'id');
  assert.deepEqual(r.segments[0][0].content, 'it');
  assert.deepEqual(r.segments[1][0].content, 'prodotti');
  assert.deepEqual(r.segments[2][0].content, 'id');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/layout.tsx'
    )
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/products/[id]/index.tsx'
    )
  );
});

test('translated pathname /docs/getting-started', ({ assertRoute }) => {
  const r = assertRoute('/documentazione/per-iniziare/');
  assert.deepEqual(r.id, 'DocsGettingstartedRoute0');
  assert.deepEqual(r.pathname, '/documentazione/per-iniziare/');
  assert.deepEqual(r.routeName, 'documentazione/per-iniziare/');
  assert.deepEqual(r.pattern, /^\/documentazione\/per-iniziare\/?/);
  assert.deepEqual(r.paramNames.length, 0);
  assert.deepEqual(r.segments[0][0].content, 'documentazione');
  assert.deepEqual(r.segments[1][0].content, 'per-iniziare');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/getting-started/index.md'
    )
  );
});

test('translated pathname /docs/[category]/[id]', ({ assertRoute }) => {
  const r = assertRoute('/documentazione/[category]/[id]/');
  assert.deepEqual(r.id, 'DocsCategoryIdRoute0');
  assert.deepEqual(r.pathname, '/documentazione/[category]/[id]/');
  assert.deepEqual(r.routeName, 'documentazione/[category]/[id]/');
  assert.deepEqual(r.pattern, /^\/documentazione\/([^/]+?)\/([^/]+?)\/?/);
  assert.deepEqual(r.paramNames[0], 'category');
  assert.deepEqual(r.paramNames[1], 'id');
  assert.deepEqual(r.segments[0][0].content, 'documentazione');
  assert.deepEqual(r.segments[1][0].content, 'category');
  assert.deepEqual(r.segments[2][0].content, 'id');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/docs/[category]/[id]/index.tsx'
    )
  );
});

test('translated pathname /about-us', ({ assertRoute }) => {
  const r = assertRoute('/informazioni/');
  assert.deepEqual(r.id, 'CommonAboutusRoute0');
  assert.deepEqual(r.pathname, '/informazioni/');
  assert.deepEqual(r.routeName, 'informazioni/');
  assert.deepEqual(r.pattern, /^\/informazioni\/?/);
  assert.deepEqual(r.paramNames.length, 0);
  assert.deepEqual(r.segments[0][0].content, 'informazioni');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/layout.tsx'
    )
  );
  assert.ok(
    r.filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/about-us/index.tsx')
  );
});

test('translated pathname /products/[id]', ({ assertRoute }) => {
  const r = assertRoute('/prodotti/[id]/');
  assert.deepEqual(r.id, 'CommonProductsIdRoute0');
  assert.deepEqual(r.pathname, '/prodotti/[id]/');
  assert.deepEqual(r.routeName, 'prodotti/[id]/');
  assert.deepEqual(r.pattern, /^\/prodotti\/([^/]+?)\/?/);
  assert.deepEqual(r.paramNames[0], 'id');
  assert.deepEqual(r.segments[0][0].content, 'prodotti');
  assert.deepEqual(r.segments[1][0].content, 'id');
  assert.deepEqual(r.layouts.length, 2);
  assert.ok(
    r.layouts[0].filePath.endsWith('e2e/qwik-e2e/apps/qwikrouter-test/src/routes/layout.tsx')
  );
  assert.ok(
    r.layouts[1].filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/layout.tsx'
    )
  );
  assert.ok(
    r.filePath.endsWith(
      'e2e/qwik-e2e/apps/qwikrouter-test/src/routes/(common)/products/[id]/index.tsx'
    )
  );
});

test('trie has _G nodes for translated routes', ({ ctx }) => {
  const trie = ctx.routeTrie;

  // Without prefix: 'documentazione' should be a child of root with _G pointing to 'docs'
  const documentazione = trie.children.get('documentazione');
  assert.ok(documentazione, 'trie should have "documentazione" child');
  const perIniziare = documentazione!.children.get('per-iniziare');
  assert.ok(perIniziare, 'trie should have "per-iniziare" under "documentazione"');
  assert.deepEqual(perIniziare!._G, 'docs/getting-started');

  // Without prefix: 'informazioni' should point to about-us
  const informazioni = trie.children.get('informazioni');
  assert.ok(informazioni, 'trie should have "informazioni" child');
  assert.deepEqual(informazioni!._G, 'about-us');

  // Without prefix: 'prodotti' should have _W child with _G pointing to products/_W
  const prodotti = trie.children.get('prodotti');
  assert.ok(prodotti, 'trie should have "prodotti" child');
  const prodottiW = prodotti!.children.get('_W');
  assert.ok(prodottiW, 'trie should have "_W" under "prodotti"');
  assert.deepEqual(prodottiW!._G, 'products/_W');
  assert.deepEqual(prodottiW!._P, 'id');

  // With prefix: 'it' should contain translated children
  const it = trie.children.get('it');
  assert.ok(it, 'trie should have "it" child');
  // 'it' root index rewrite
  assert.deepEqual(it!._G, '');
  // 'it/documentazione/per-iniziare'
  const itDoc = it!.children.get('documentazione');
  assert.ok(itDoc, 'trie should have "documentazione" under "it"');
  const itDocGs = itDoc!.children.get('per-iniziare');
  assert.ok(itDocGs, 'trie should have "per-iniziare" under "it/documentazione"');
  assert.deepEqual(itDocGs!._G, 'docs/getting-started');
});

const testWithDuplicatedRoutes = testAppSuite('Duplicated segments with multiple prefixes', {
  rewriteRoutes: [
    {
      prefix: 'de',
      paths: {
        produkt: 'produkt',
      },
    },
    {
      prefix: 'no',
      paths: {
        produkt: 'produkt',
      },
    },
    {
      prefix: 'fi',
      paths: {
        produkt: 'tuote',
      },
    },
  ],
});

testWithDuplicatedRoutes(
  'Issue #6375: be able to deal with the same translated pathnames with multiple prefixes ',
  ({ assertRoute }) => {
    const r = assertRoute('/produkt/');

    assert.deepEqual(r.pathname, '/produkt/');
  }
);

const testSameRoutes = testAppSuite('Same route with undefined prefixes', {
  rewriteRoutes: [
    {
      prefix: undefined,
      paths: {},
    },
    {
      prefix: undefined,
      paths: {
        produkt: 'produkt',
      },
    },
    {
      prefix: undefined,
      paths: {
        produkt: 'produkt',
      },
    },
  ],
});

testSameRoutes(
  'Issue #6799: Bug while using rewrite routes pointing to the same file',
  ({ assertRoute }) => {
    const r = assertRoute('/produkt/');
    assert.deepEqual(r.pathname, '/produkt/');
  }
);

const testExclude = testAppSuite('Rewrite routes with exclude', {
  rewriteRoutes: [{ prefix: 'it', paths: {}, exclude: ['/docs/*'] }],
});

testExclude('exclude skips localized mirrors for matched routes', ({ ctx }) => {
  const it = ctx.routeTrie.children.get('it');
  assert.ok(it, 'prefix mirror "it" should exist for non-excluded routes');
  assert.ok(it!.children.get('about-us'), 'non-excluded route is mirrored under "it"');
  assert.strictEqual(
    it!.children.get('docs'),
    undefined,
    '"/docs/*" is excluded from the "it" mirror'
  );
});
