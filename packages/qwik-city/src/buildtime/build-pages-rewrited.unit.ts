import * as assert from 'uvu/assert';
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
  assert.equal(r.id, 'CommonRouteIT');
  assert.equal(r.pathname, '/it/');
  assert.equal(r.routeName, 'it/');
  assert.equal(r.pattern, /^\/it\/$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.segments[0][0].content, 'it');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/layout.tsx')
  );
  assert.ok(r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/index.tsx'));
});

test('translated pathname /docs/getting-started with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/documentazione/per-iniziare/');
  assert.equal(r.id, 'DocsGettingstartedRouteIT');
  assert.equal(r.pathname, '/it/documentazione/per-iniziare/');
  assert.equal(r.routeName, 'it/documentazione/per-iniziare/');
  assert.equal(r.pattern, /^\/it\/documentazione\/per-iniziare\/?/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.segments[0][0].content, 'it');
  assert.equal(r.segments[1][0].content, 'documentazione');
  assert.equal(r.segments[2][0].content, 'per-iniziare');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/getting-started/index.md')
  );
});

test('translated pathname /docs/[category]/[id] with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/documentazione/[category]/[id]/');
  assert.equal(r.id, 'DocsCategoryIdRouteIT');
  assert.equal(r.pathname, '/it/documentazione/[category]/[id]/');
  assert.equal(r.routeName, 'it/documentazione/[category]/[id]/');
  assert.equal(r.pattern, /^\/it\/documentazione\/([^/]+?)\/([^/]+?)\/?/);
  assert.equal(r.paramNames[0], 'category');
  assert.equal(r.paramNames[1], 'id');
  assert.equal(r.segments[0][0].content, 'it');
  assert.equal(r.segments[1][0].content, 'documentazione');
  assert.equal(r.segments[2][0].content, 'category');
  assert.equal(r.segments[3][0].content, 'id');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/[category]/[id]/index.tsx')
  );
});

test('translated pathname /about-us with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/informazioni/');
  assert.equal(r.id, 'CommonAboutusRouteIT');
  assert.equal(r.pathname, '/it/informazioni/');
  assert.equal(r.routeName, 'it/informazioni/');
  assert.equal(r.pattern, /^\/it\/informazioni\/?/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.segments[0][0].content, 'it');
  assert.equal(r.segments[1][0].content, 'informazioni');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/about-us/index.tsx')
  );
});

test('translated pathname /products/[id] with prefix', ({ assertRoute }) => {
  const r = assertRoute('/it/prodotti/[id]/');
  assert.equal(r.id, 'CommonProductsIdRouteIT');
  assert.equal(r.pathname, '/it/prodotti/[id]/');
  assert.equal(r.routeName, 'it/prodotti/[id]/');
  assert.equal(r.pattern, /^\/it\/prodotti\/([^/]+?)\/?/);
  assert.equal(r.paramNames[0], 'id');
  assert.equal(r.segments[0][0].content, 'it');
  assert.equal(r.segments[1][0].content, 'prodotti');
  assert.equal(r.segments[2][0].content, 'id');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/products/[id]/index.tsx')
  );
});

test('translated pathname /docs/getting-started', ({ assertRoute }) => {
  const r = assertRoute('/documentazione/per-iniziare/');
  assert.equal(r.id, 'DocsGettingstartedRoute0');
  assert.equal(r.pathname, '/documentazione/per-iniziare/');
  assert.equal(r.routeName, 'documentazione/per-iniziare/');
  assert.equal(r.pattern, /^\/documentazione\/per-iniziare\/?/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.segments[0][0].content, 'documentazione');
  assert.equal(r.segments[1][0].content, 'per-iniziare');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/getting-started/index.md')
  );
});

test('translated pathname /docs/[category]/[id]', ({ assertRoute }) => {
  const r = assertRoute('/documentazione/[category]/[id]/');
  assert.equal(r.id, 'DocsCategoryIdRoute0');
  assert.equal(r.pathname, '/documentazione/[category]/[id]/');
  assert.equal(r.routeName, 'documentazione/[category]/[id]/');
  assert.equal(r.pattern, /^\/documentazione\/([^/]+?)\/([^/]+?)\/?/);
  assert.equal(r.paramNames[0], 'category');
  assert.equal(r.paramNames[1], 'id');
  assert.equal(r.segments[0][0].content, 'documentazione');
  assert.equal(r.segments[1][0].content, 'category');
  assert.equal(r.segments[2][0].content, 'id');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/docs/[category]/[id]/index.tsx')
  );
});

test('translated pathname /about-us', ({ assertRoute }) => {
  const r = assertRoute('/informazioni/');
  assert.equal(r.id, 'CommonAboutusRoute0');
  assert.equal(r.pathname, '/informazioni/');
  assert.equal(r.routeName, 'informazioni/');
  assert.equal(r.pattern, /^\/informazioni\/?/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.segments[0][0].content, 'informazioni');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/about-us/index.tsx')
  );
});

test('translated pathname /products/[id]', ({ assertRoute }) => {
  const r = assertRoute('/prodotti/[id]/');
  assert.equal(r.id, 'CommonProductsIdRoute0');
  assert.equal(r.pathname, '/prodotti/[id]/');
  assert.equal(r.routeName, 'prodotti/[id]/');
  assert.equal(r.pattern, /^\/prodotti\/([^/]+?)\/?/);
  assert.equal(r.paramNames[0], 'id');
  assert.equal(r.segments[0][0].content, 'prodotti');
  assert.equal(r.segments[1][0].content, 'id');
  assert.equal(r.layouts.length, 2);
  assert.ok(r.layouts[0].filePath.endsWith('starters/apps/qwikcity-test/src/routes/layout.tsx'));
  assert.ok(
    r.layouts[1].filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/layout.tsx')
  );
  assert.ok(
    r.filePath.endsWith('starters/apps/qwikcity-test/src/routes/(common)/products/[id]/index.tsx')
  );
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

    assert.equal(r.pathname, '/produkt/');
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
    assert.equal(r.pathname, '/produkt/');
  }
);
